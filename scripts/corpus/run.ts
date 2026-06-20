/**
 * "Hit run and see results" — the corpus harness entry point.
 *
 *   reset DB (unless --no-reset) -> for each post: insert source, extract,
 *   drain decomposition/assessment -> generate a report.
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
import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import {
  argFlag,
  assertCorpusDb,
  hasFlag,
  loadManifest,
  positional,
  postMarkdownPath,
} from "./lib.js";
import type { ManifestPost } from "./lib.js";
import { closeDb, getDb } from "../../src/db/client.js";
import { sources } from "../../src/db/schema.js";
import { createJob, getJobById } from "../../src/services/job-service.js";
import { handleUrlExtraction } from "../../src/workers/url-extraction.js";
import { resetCorpusDb } from "./reset.js";
import { drainClaimPipeline } from "./driver.js";
import { generateReport } from "./report.js";

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

  // Backstop: make sure we resolved the isolated corpus DB, not the main graph,
  // before we reset or write anything.
  assertCorpusDb();

  console.log(`\n=== corpus run: ${cluster} — ${posts.length} post(s) ===`);

  if (!hasFlag("no-reset")) {
    console.log("Resetting corpus DB…");
    await resetCorpusDb();
  } else {
    console.log("--no-reset: ingesting on top of the existing graph");
  }

  const db = getDb();
  let succeeded = 0;

  for (const [i, p] of posts.entries()) {
    const tag = `[${i + 1}/${posts.length}]`;
    const mdPath = postMarkdownPath(cluster, p.id);
    if (!existsSync(mdPath)) {
      console.log(`  ${tag} ${p.id} — MISSING markdown; run \`npm run corpus:fetch\` first`);
      continue;
    }
    const url = `https://www.lesswrong.com/posts/${p.id}/${p.slug}`;
    process.stdout.write(`  ${tag} ${p.title.slice(0, 50).padEnd(50)} extract…`);
    const started = Date.now();
    try {
      // Skip posts already ingested (relevant under --no-reset) — re-inserting
      // would violate the sources.url unique constraint and re-create instances.
      const [existing] = await db.select().from(sources).where(eq(sources.url, url)).limit(1);
      if (existing) {
        console.log(" already ingested — skipping (reset to re-run)");
        continue;
      }

      const content = readFileSync(mdPath, "utf8");
      const [src] = await db
        .insert(sources)
        .values({ url, title: p.title, rawContent: content, sourceType: "lesswrong_post" })
        .returning();
      const job = await createJob("url_extraction", { sourceId: src!.id, url });

      await handleUrlExtraction({ sourceId: src!.id, jobId: job.id, url });
      const steps = await drainClaimPipeline();
      const finished = await getJobById(job.id);
      const r = (finished?.result ?? {}) as Record<string, number>;
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        ` ✓ ${r.claims_extracted ?? "?"} extracted, ` +
          `${r.claims_created ?? "?"} new / ${r.claims_matched ?? "?"} matched, ` +
          `${steps} decomp steps (${secs}s)`
      );
      succeeded++;
    } catch (err) {
      const msg = (err as Error).message;
      console.log(` ✗ ${msg}`);
      // Drain whatever this post already enqueued so partial work is processed
      // and attributed here, not orphaned or leaked into the next post.
      await drainClaimPipeline().catch(() => {});
      if (/budget/i.test(msg)) {
        console.log("\nLLM budget exceeded — stopping early. Report will cover what was ingested.");
        break;
      }
    }
  }

  console.log(`\n${succeeded}/${posts.length} posts ingested. Generating report…`);
  const reportPath = await generateReport(cluster);
  console.log(`\nReport: ${reportPath}`);
  console.log("Read it alongside corpus/RUBRIC.md.");

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
