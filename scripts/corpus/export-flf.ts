/**
 * Export a completed corpus run into page-ready JSON for the temporary FLF
 * explainer page (issue #78b). Reads a corpus DB directly and emits a curated
 * `web/content/flf/<cluster>.json` showcasing the stack on that case study:
 * sources, a multi-source (matched) claim, a decomposed+assessed claim with its
 * argument tree, and a contested claim carrying opposing instances.
 *
 * Usage:
 *   DATABASE_URL=postgresql://…/episteme_corpus \
 *     npx tsx scripts/corpus/export-flf.ts blackholes
 *   # or point at a per-cluster DB:
 *   npx tsx scripts/corpus/export-flf.ts eggs --db=postgresql://…/episteme_corpus_eggs
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const cluster = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!cluster) {
  console.error("Usage: export-flf.ts <cluster> [--db=URL] [--out=PATH]");
  process.exit(1);
}
const dbUrl = arg("db") ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Set DATABASE_URL or pass --db=URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

interface InstanceRow {
  original_text: string;
  context: string | null;
  stance: string;
  confidence: number;
  source_title: string;
  source_url: string | null;
  source_type: string;
}

async function instancesFor(claimId: string): Promise<InstanceRow[]> {
  return q<InstanceRow>(
    `SELECT ci.original_text, ci.context, ci.stance, ci.confidence,
            s.title AS source_title, s.url AS source_url, s.source_type
       FROM claim_instances ci JOIN sources s ON s.id = ci.source_id
      WHERE ci.claim_id = $1
      ORDER BY ci.stance, s.title`,
    [claimId]
  );
}

interface ClaimRow {
  id: string;
  text: string;
  claim_type: string;
  importance: number;
  decomposition_status: string;
  steward_state: string;
  status: string | null;
  confidence: number | null;
  summary: string | null;
  reasoning_trace: string | null;
}

async function claimCore(id: string): Promise<ClaimRow | null> {
  const [row] = await q<ClaimRow>(
    `SELECT c.id, c.text, c.claim_type, c.importance, c.decomposition_status, c.steward_state,
            a.status, a.confidence, a.summary, a.reasoning_trace
       FROM claims c
       LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
      WHERE c.id = $1`,
    [id]
  );
  return row ?? null;
}

// A one-level decomposition: the claim's arguments and the subclaims grouped
// under each, with each edge's relation and each subclaim's own verdict.
async function decomposition(claimId: string) {
  const args = await q(
    `SELECT id, name, stance, content FROM arguments WHERE claim_id = $1 ORDER BY created_at`,
    [claimId]
  );
  const children = await q(
    `SELECT cr.relation_type, cr.reasoning, cr.argument_id,
            c.id, c.text, c.claim_type, c.importance,
            a.status, a.confidence
       FROM claim_relationships cr
       JOIN claims c ON c.id = cr.child_claim_id
       LEFT JOIN assessments a ON a.claim_id = c.id AND a.is_current = true
      WHERE cr.parent_claim_id = $1
      ORDER BY cr.created_at`,
    [claimId]
  );
  return { arguments: args, children };
}

async function main() {
  const [{ n: sourceCount }] = await q<{ n: number }>(`SELECT count(*)::int n FROM sources`);
  const [{ n: claimCount }] = await q<{ n: number }>(`SELECT count(*)::int n FROM claims WHERE state='active'`);
  const [{ n: instanceCount }] = await q<{ n: number }>(`SELECT count(*)::int n FROM claim_instances`);
  const [{ n: assessedCount }] = await q<{ n: number }>(
    `SELECT count(*)::int n FROM assessments WHERE is_current`
  );
  const [{ n: relCount }] = await q<{ n: number }>(`SELECT count(*)::int n FROM claim_relationships`);
  const [{ n: argCount }] = await q<{ n: number }>(`SELECT count(*)::int n FROM arguments`);

  const sources = await q(
    `SELECT s.title, s.url, s.source_type,
            (SELECT count(*)::int FROM claim_instances ci WHERE ci.source_id = s.id) AS instances
       FROM sources s ORDER BY s.retrieved_at`
  );

  // Extraction example: the source with the most extracted instances, and a few
  // of the claims pulled from it.
  const extraction = await q(
    `SELECT c.id, c.text, c.claim_type, c.importance, ci.original_text,
            s.title AS source_title
       FROM claim_instances ci
       JOIN claims c ON c.id = ci.claim_id
       JOIN sources s ON s.id = ci.source_id
      WHERE c.state='active'
      ORDER BY s.retrieved_at, c.importance DESC
      LIMIT 6`
  );

  // Matching example: the claim carrying the most instances across sources.
  const [multi] = await q<{ id: string; n: number }>(
    `SELECT ci.claim_id AS id, count(DISTINCT ci.source_id)::int n
       FROM claim_instances ci JOIN claims c ON c.id = ci.claim_id
      WHERE c.state='active'
      GROUP BY 1 ORDER BY 2 DESC, count(*) DESC LIMIT 1`
  );
  const matched = multi
    ? { claim: await claimCore(multi.id), instances: await instancesFor(multi.id) }
    : null;

  // Contested example: a claim that carries BOTH affirming and denying instances
  // (the disagreement lives on one node), preferring an assessed one.
  const [contestedRow] = await q<{ id: string }>(
    `SELECT c.id
       FROM claims c
      WHERE c.state='active'
        AND EXISTS (SELECT 1 FROM claim_instances ci WHERE ci.claim_id=c.id AND ci.stance='affirms')
        AND EXISTS (SELECT 1 FROM claim_instances ci WHERE ci.claim_id=c.id AND ci.stance='denies')
      ORDER BY (SELECT count(*) FROM claim_instances ci WHERE ci.claim_id=c.id) DESC
      LIMIT 1`
  );
  const contested = contestedRow
    ? { claim: await claimCore(contestedRow.id), instances: await instancesFor(contestedRow.id) }
    : null;

  // Decomposition + assessment example: the highest-importance claim that has
  // both an assessment and at least one subclaim.
  const [deepRow] = await q<{ id: string }>(
    `SELECT c.id FROM claims c
       JOIN assessments a ON a.claim_id=c.id AND a.is_current
      WHERE c.state='active'
        AND EXISTS (SELECT 1 FROM claim_relationships cr WHERE cr.parent_claim_id=c.id)
      ORDER BY c.importance DESC LIMIT 1`
  );
  const decomposed = deepRow
    ? {
        claim: await claimCore(deepRow.id),
        instances: await instancesFor(deepRow.id),
        ...(await decomposition(deepRow.id)),
      }
    : null;

  // Every assessed claim, for the assessment-status distribution.
  const assessments = await q(
    `SELECT c.text, c.importance, a.status, a.confidence, a.summary
       FROM assessments a JOIN claims c ON c.id=a.claim_id
      WHERE a.is_current AND c.state='active'
      ORDER BY c.importance DESC`
  );

  const out = {
    cluster,
    generatedAt: new Date().toISOString(),
    counts: {
      sources: sourceCount,
      claims: claimCount,
      instances: instanceCount,
      assessed: assessedCount,
      relationships: relCount,
      arguments: argCount,
    },
    sources,
    extraction,
    matched,
    contested,
    decomposed,
    assessments,
  };

  const outPath = arg("out") ?? join(REPO_ROOT, "web", "content", "flf", `${cluster}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(
    `✓ ${cluster}: ${claimCount} claims, ${assessedCount} assessed, ${instanceCount} instances → ${outPath}`
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
