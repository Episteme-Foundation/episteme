/**
 * "Hit run and see results" — the corpus harness entry point.
 *
 * This runs the REAL system against the isolated corpus DB: it builds the actual
 * Fastify app and submits each post through the real `POST /sources` route
 * (via in-process injection), then drains the in-memory queues with the same
 * local runner the dev server uses. Inputs and processing are exactly what
 * production does; only the database differs. A trace of every agent message is
 * recorded so inter-agent behavior and propagation are observable.
 *
 * Usage:
 *   tsx scripts/corpus/run.ts [cluster] [flags]
 *
 * Flags:
 *   --no-reset        keep the existing graph (ingest on top of it)
 *   --limit=N         only the first N posts (cheap smoke test)
 *   --posts=id1,id2   only these post IDs
 *
 * Examples:
 *   npm run corpus:run -- lethalities --limit=2     # quick, cheap
 *   npm run corpus:run -- lethalities               # full cluster
 */
import "./lib.js"; // must be first: pins DATABASE_URL to the corpus DB
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  argFlag,
  assertCorpusDb,
  hasFlag,
  loadManifest,
  positional,
  postMarkdownPath,
  postUrl,
  RUNS_ROOT,
} from "./lib.js";
import type { ManifestPost } from "./lib.js";
import { closeDb } from "../../src/db/client.js";
import { getSessionUsage } from "../../src/llm/budget-tracker.js";
import type { SessionUsage } from "../../src/llm/budget-tracker.js";
import { getJobById } from "../../src/services/job-service.js";
import { buildApp } from "../../src/server/app.js";
import { drainLocalQueues } from "../../src/workers/local-runner.js";
import type { DrainStats, RunnerEvent } from "../../src/workers/local-runner.js";
import { resetCorpusDb } from "./reset.js";
import { generateReport } from "./report.js";
import { scoreRun } from "./score.js";

function formatActivity(stats: DrainStats): string {
  const acts = Object.entries(stats.processed).map(([q, n]) => `${q} ${n}`);
  const errs = Object.values(stats.errors).reduce((a, b) => a + b, 0);
  let s = acts.join(", ") || "no follow-up work";
  if (errs) s += `, ${errs} handler errors`;
  if (stats.capped) s += " (CAPPED — did not reach quiescence)";
  return s;
}

// Per-1M-token prices for the cost estimate. We price EVERYTHING at Sonnet
// rates even though the Matcher/second-opinion run on Haiku (≈3x cheaper), so
// the printed figure is a deliberate UPPER BOUND — if this stays small, the real
// bill is smaller. Cache reads are ~0.1x input; cache writes ~1.25x input.
const PRICE = { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };

function estimateCostUsd(u: SessionUsage): number {
  return (
    (u.inputTokens * PRICE.input +
      u.outputTokens * PRICE.output +
      u.cacheReadTokens * PRICE.cacheRead +
      u.cacheCreationTokens * PRICE.cacheWrite) /
    1_000_000
  );
}

function printUsage(label: string): void {
  const u = getSessionUsage();
  const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
  const cacheTotalInput = u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
  const hitRate =
    cacheTotalInput > 0 ? ((u.cacheReadTokens / cacheTotalInput) * 100).toFixed(0) : "0";
  console.log(
    `\n=== LLM usage (${label}) ===\n` +
      `  calls: ${u.calls}\n` +
      `  input:  ${k(u.inputTokens)} fresh + ${k(u.cacheReadTokens)} cache-read ` +
      `+ ${k(u.cacheCreationTokens)} cache-write  (cache hit rate ${hitRate}%)\n` +
      `  output: ${k(u.outputTokens)}\n` +
      `  est. cost (Sonnet-priced upper bound): $${estimateCostUsd(u).toFixed(3)}`
  );
}

function selectPosts(all: ManifestPost[]): ManifestPost[] {
  const only = argFlag("posts")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const limitRaw = argFlag("limit");
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) {
      console.error(`Invalid --limit=${limitRaw} (expected a positive integer).`);
      process.exit(1);
    }
  }
  let posts = all;
  if (only?.length) posts = posts.filter((p) => only.includes(p.id));
  if (limit !== undefined) posts = posts.slice(0, limit);
  return posts;
}

async function main(): Promise<void> {
  const cluster = positional(0) ?? "lethalities";
  const manifest = loadManifest(cluster);
  const posts = selectPosts(manifest.posts);

  // Preflight: the pipeline needs both an LLM key and an embeddings key.
  const missing = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}. Set them in .env.`);
    process.exit(1);
  }

  // Don't run a destructive reset just to ingest nothing.
  if (posts.length === 0) {
    console.error("No posts selected (check --posts / --limit / manifest). Not resetting.");
    process.exit(1);
  }

  // Backstop: confirm we resolved the isolated corpus DB, not the main graph,
  // before we reset or write anything.
  assertCorpusDb();

  console.log(`\n=== corpus run: ${cluster} — ${posts.length} post(s) ===`);

  if (!hasFlag("no-reset")) {
    console.log("Resetting corpus DB…");
    await resetCorpusDb();
  } else {
    console.log("--no-reset: ingesting on top of the existing graph");
  }

  const runDir = join(RUNS_ROOT, `${cluster}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(runDir, { recursive: true });
  const trace: RunnerEvent[] = [];

  // The actual production app, pointed at the corpus DB.
  const app = await buildApp();
  let succeeded = 0;

  try {
    for (const [i, p] of posts.entries()) {
      const tag = `[${i + 1}/${posts.length}]`;
      const mdPath = postMarkdownPath(cluster, p.id);
      if (!existsSync(mdPath)) {
        console.log(`  ${tag} ${p.id} — MISSING markdown; run \`npm run corpus:fetch\` first`);
        continue;
      }
      const content = readFileSync(mdPath, "utf8");
      const url = postUrl(p);

      process.stdout.write(`  ${tag} ${p.title.slice(0, 50).padEnd(50)} submit…`);
      const started = Date.now();
      try {
        // Submit through the real route, exactly as an API client would.
        const res = await app.inject({
          method: "POST",
          url: "/sources",
          payload: { url, title: p.title, content },
        });
        if (res.statusCode !== 202) {
          console.log(` ✗ POST /sources -> ${res.statusCode} ${res.body.slice(0, 120)}`);
          continue;
        }
        const { job_id } = res.json() as { job_id: string };

        // Drive the whole organization to a stable state, tracing every message.
        const before = trace.length;
        const stats = await drainLocalQueues({ onEvent: (e) => trace.push(e) });

        const finished = await getJobById(job_id);
        const r = (finished?.result ?? {}) as Record<string, number>;
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        console.log(
          ` ✓ ${r.claims_extracted ?? "?"} extracted, ` +
            `${r.claims_created ?? "?"} new / ${r.claims_matched ?? "?"} matched ` +
            `(${secs}s, ${trace.length - before} agent msgs)\n      agents: ${formatActivity(stats)}`
        );
        succeeded++;
      } catch (err) {
        const msg = (err as Error).message;
        console.log(` ✗ ${msg}`);
        // Drain whatever this post already enqueued so partial work is processed
        // and attributed here, not orphaned or leaked into the next post.
        await drainLocalQueues({ onEvent: (e) => trace.push(e) }).catch(() => {});
        if (/budget/i.test(msg)) {
          console.log("\nLLM budget exceeded — stopping early. Report covers what was ingested.");
          break;
        }
      }
    }
  } finally {
    await app.close();
  }

  // Observability artifact: the full ordered stream of agent activity.
  writeFileSync(join(runDir, "trace.jsonl"), trace.map((e) => JSON.stringify(e)).join("\n"));

  console.log(`\n${succeeded}/${posts.length} posts ingested. Generating report…`);
  const reportPath = await generateReport(cluster, runDir);
  console.log(`\nReport: ${reportPath}`);
  console.log(`Trace:  ${join(runDir, "trace.jsonl")} (${trace.length} agent messages)`);
  console.log("Read the report alongside corpus/RUBRIC.md.");

  // Optional scored scorecard (#99). --score emits structural metrics + a
  // bounded LLM-judge sample into the same run dir; --score=N sets the sample
  // size; --score=0 is structural-only (free). Off by default so a plain run
  // stays cheap.
  const scoreFlag = argFlag("score");
  if (scoreFlag !== undefined) {
    const sample = scoreFlag === "" ? undefined : Number(scoreFlag);
    console.log("\nScoring the run…");
    const { dir } = await scoreRun(cluster, {
      sample: Number.isFinite(sample) ? sample : undefined,
      judge: sample !== 0,
      outDir: runDir,
    });
    console.log(`Scorecard: ${join(dir, "scorecard.md")}`);
  }

  printUsage("this run");

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  // Still report what the run cost before it failed — a crash shouldn't hide spend.
  try {
    printUsage("partial — run errored");
  } catch {
    /* usage reporting is best-effort */
  }
  await closeDb().catch(() => {});
  process.exit(1);
});
