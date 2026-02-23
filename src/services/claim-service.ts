import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { claims, arguments_, type NewClaim } from "../db/schema.js";
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

  // Enqueue for async processing (decomposition + assessment)
  await enqueueClaimPipeline({
    claimId: claim!.id,
    jobId: job.id,
    ancestorIds: [],
    currentDepth: 0,
  });

  return { claim: claim!, argument: argument!, jobId: job.id };
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
