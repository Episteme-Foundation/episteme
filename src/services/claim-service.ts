import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { claims, assessments, arguments_, type NewClaim } from "../db/schema.js";
import { generateEmbedding } from "./embedding-service.js";
import { createJob } from "./job-service.js";
import { enqueueClaimPipeline } from "./queue-service.js";

/**
 * Create a new claim with an initial argument, generate embedding, and enqueue for processing.
 */
export async function proposeClaim(input: {
  claim: string;
  argument: string;
  createdBy?: string;
}) {
  const db = getDb();
  const createdBy = input.createdBy ?? "user";

  // Generate embedding
  let embedding: number[] | undefined;
  try {
    embedding = await generateEmbedding(input.claim);
  } catch {
    // Proceed without embedding; will be retried in pipeline
  }

  // Create claim
  const newClaim: NewClaim = {
    text: input.claim,
    createdBy,
    embedding,
  };

  const [claim] = await db.insert(claims).values(newClaim).returning();

  // Create argument
  const [argument] = await db
    .insert(arguments_)
    .values({
      claimId: claim!.id,
      stance: "for",
      content: input.argument,
      createdBy,
    })
    .returning();

  // Create tracking job
  const job = await createJob("claim_pipeline", { claimId: claim!.id });

  // Onboard the new claim (the Steward will structure + assess it)
  await enqueueClaimPipeline({
    claimId: claim!.id,
    jobId: job.id,
  });

  return { claim: claim!, argument: argument!, jobId: job.id };
}

// Opaque keyset cursor over (updated_at, id) — the sort key for the browse feed.
function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
  try {
    const [updatedAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    return updatedAt && id ? { updatedAt, id } : null;
  } catch {
    return null;
  }
}

/**
 * List claims for browsing, most-recently-updated first, with each claim's
 * current assessment (if any) joined in. Excludes claims merged into another.
 *
 * Uses keyset pagination on (updated_at, id) rather than LIMIT/OFFSET so it
 * stays O(limit) regardless of how deep the feed goes, and returns no exact
 * total (a count over the full table doesn't scale and isn't needed for a
 * recency feed). For discovery at scale, search and faceted filters are the
 * primary access paths; this is the "recent activity" stream.
 */
export async function listClaims(opts: {
  limit: number;
  cursor?: string;
  state?: string;
}) {
  const db = getDb();

  const filters = [isNull(claims.mergedInto)];
  if (opts.state) filters.push(eq(claims.state, opts.state));

  const cur = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (cur) {
    // Row-value comparison: strictly "older" than the cursor under the
    // (updated_at DESC, id DESC) ordering. Seeks via idx_claims_updated.
    filters.push(
      sql`(${claims.updatedAt}, ${claims.id}) < (${cur.updatedAt}::timestamptz, ${cur.id}::uuid)`
    );
  }

  // Fetch one extra row to determine whether a further page exists.
  const rows = await db
    .select({
      id: claims.id,
      text: claims.text,
      claim_type: claims.claimType,
      state: claims.state,
      importance: claims.importance,
      updated_at: claims.updatedAt,
      assessment_status: assessments.status,
      assessment_confidence: assessments.confidence,
    })
    .from(claims)
    .leftJoin(
      assessments,
      and(eq(assessments.claimId, claims.id), eq(assessments.isCurrent, true))
    )
    .where(and(...filters))
    .orderBy(desc(claims.updatedAt), desc(claims.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const results = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = results[results.length - 1];
  const next_cursor =
    hasMore && last ? encodeCursor(last.updated_at, last.id) : null;

  return { results, next_cursor };
}

/**
 * Get a claim by ID.
 */
export async function getClaimById(claimId: string) {
  const db = getDb();
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  return claim ?? null;
}

/**
 * Update claim fields.
 */
export async function updateClaim(
  claimId: string,
  updates: Partial<Pick<NewClaim, "state" | "decompositionStatus">>
) {
  const db = getDb();
  const [updated] = await db
    .update(claims)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(claims.id, claimId))
    .returning();
  return updated ?? null;
}
