import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { claims, claimRelationships } from "../db/schema.js";
import { decomposeClaim } from "../llm/agents/decomposer.js";
import { generateEmbedding } from "../services/embedding-service.js";
import { findSimilarClaims } from "../services/search-service.js";
import { addArgument } from "../services/argument-service.js";
import { enqueueClaimPipeline, enqueueSteward } from "../services/queue-service.js";
import { loadConfig } from "../config.js";
import type { ClaimPipelineMessage } from "../services/queue-service.js";

/**
 * Handle a claim pipeline message. Each message = one LLM call + DB writes + enqueue follow-ups.
 *
 * The pipeline is purely *structural*: it decomposes a claim and wires up its
 * subclaims. It does NOT assess — assessment is open-ended judgment owned by the
 * Claim Steward (constitution Part VII, issue #30). Every claim, atomic or
 * compound, is handed to the Steward for assessment once its structure exists.
 *
 * Flow:
 * 1. Decompose the claim into subclaims (one LLM call)
 * 2. For each subclaim:
 *    a. Match against existing claims (pgvector cosine search)
 *    b. If match: create relationship, done
 *    c. If new: create claim, generate embedding, enqueue to claim-pipeline
 * 3. Enqueue this claim to the Steward to be assessed. Bottom-up ordering is a
 *    *re-trigger* concern, not a gate: a parent is assessed provisionally and
 *    re-judged when a child steward notifies it that the child's assessment
 *    changed.
 */
export async function handleClaimPipeline(
  message: ClaimPipelineMessage
): Promise<void> {
  const db = getDb();
  const config = loadConfig();

  // Idempotency: check if already processed
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, message.claimId))
    .limit(1);

  if (!claim) return;

  if (
    claim.decompositionStatus === "complete" ||
    claim.decompositionStatus === "processing"
  ) {
    return; // Already handled
  }

  // Mark as processing
  await db
    .update(claims)
    .set({ decompositionStatus: "processing", updatedAt: new Date() })
    .where(eq(claims.id, message.claimId));

  try {
    // Depth limit check
    if (message.currentDepth >= config.maxDecompositionDepth) {
      // Mark as atomic and hand to the steward for assessment
      await db
        .update(claims)
        .set({ decompositionStatus: "atomic", updatedAt: new Date() })
        .where(eq(claims.id, message.claimId));

      await enqueueAssessment(
        message.claimId,
        "Reached maximum decomposition depth; treated as atomic."
      );
      return;
    }

    // Decompose
    const result = await decomposeClaim({
      claimText: claim.text,
      claimType: claim.claimType,
      maxSubclaims: config.maxSubclaimsPerClaim,
    });

    // Hard cap as a safety net in case the model exceeds the requested limit.
    if (config.maxSubclaimsPerClaim > 0) {
      result.subclaims = result.subclaims.slice(0, config.maxSubclaimsPerClaim);
    }

    if (result.is_atomic || result.subclaims.length === 0) {
      // Atomic claim - hand to the steward for assessment
      await db
        .update(claims)
        .set({ decompositionStatus: "atomic", updatedAt: new Date() })
        .where(eq(claims.id, message.claimId));

      await enqueueAssessment(
        message.claimId,
        "Atomic claim (no decomposition); assess from instances and evidence."
      );
      return;
    }

    // Create argument records for named arguments
    const argumentIdMap = new Map<string, string>();
    if (result.arguments && result.arguments.length > 0) {
      for (const arg of result.arguments) {
        const argument = await addArgument({
          claimId: message.claimId,
          stance: arg.stance as "for" | "against" | "neutral",
          content: arg.description,
          name: arg.name,
          description: arg.description,
          createdBy: "decomposer",
        });
        argumentIdMap.set(arg.name, argument.id);
      }
    }

    // Process subclaims
    let childrenTotal = 0;

    for (const subclaim of result.subclaims) {
      let childClaimId: string;

      // Check for existing matching claim
      let embedding: number[] | undefined;
      try {
        embedding = await generateEmbedding(subclaim.text);
      } catch {
        // Continue without embedding
      }

      let matched = false;
      if (embedding) {
        const similar = await findSimilarClaims(embedding, {
          limit: 1,
          minSimilarity: config.matchingSimilarityThreshold,
          excludeId: message.claimId,
        });

        if (similar.length > 0 && similar[0]) {
          childClaimId = similar[0].id;
          matched = true;
        }
      }

      if (!matched) {
        // Create new claim
        const [newClaim] = await db
          .insert(claims)
          .values({
            text: subclaim.text,
            claimType: subclaim.is_atomic ? claim.claimType : "empirical_derived",
            embedding: embedding ?? undefined,
            createdBy: "decomposer",
          })
          .returning();

        childClaimId = newClaim!.id;
      }

      // Resolve argument ID from name
      const argumentId = subclaim.argument_name
        ? argumentIdMap.get(subclaim.argument_name) ?? null
        : null;

      // Cycle detection
      if (message.ancestorIds.includes(childClaimId!)) {
        // Create relationship but don't enqueue (cycle)
        await createRelationship(
          message.claimId,
          childClaimId!,
          subclaim.relation,
          subclaim.reasoning,
          subclaim.confidence,
          argumentId
        );
        continue;
      }

      // Create relationship
      await createRelationship(
        message.claimId,
        childClaimId!,
        subclaim.relation,
        subclaim.reasoning,
        subclaim.confidence,
        argumentId
      );

      childrenTotal++;

      // Enqueue child for further processing (if new)
      if (!matched) {
        await enqueueClaimPipeline({
          claimId: childClaimId!,
          jobId: message.jobId,
          ancestorIds: [...message.ancestorIds, message.claimId],
          currentDepth: message.currentDepth + 1,
        });
      }
    }

    // Update parent with children count (informational; assessment no longer
    // gates on it — see #30).
    await db
      .update(claims)
      .set({
        decompositionStatus: "complete",
        childrenTotal,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, message.claimId));

    // Hand the (now structured) claim to the steward to assess. It assesses
    // provisionally even before its children are assessed; each child steward
    // notifies it when the child's assessment changes, prompting a re-judgement.
    await enqueueAssessment(
      message.claimId,
      childrenTotal === 0
        ? "Decomposition produced no new children; assess from instances and evidence."
        : `Decomposed into ${childrenTotal} subclaim(s); assess holistically.`
    );
  } catch (err) {
    // Mark as pending so it can be retried
    await db
      .update(claims)
      .set({ decompositionStatus: "pending", updatedAt: new Date() })
      .where(eq(claims.id, message.claimId));
    throw err;
  }
}

async function createRelationship(
  parentId: string,
  childId: string,
  relationType: string,
  reasoning: string,
  confidence: number,
  argumentId?: string | null
): Promise<void> {
  const db = getDb();
  try {
    await db.insert(claimRelationships).values({
      parentClaimId: parentId,
      childClaimId: childId,
      // Normalize case so "REQUIRES" and "requires" don't fragment the taxonomy
      // (also keeps the (parent, child, relation_type) unique index meaningful).
      relationType: relationType.toLowerCase(),
      reasoning,
      confidence,
      argumentId: argumentId ?? null,
    });
  } catch {
    // Unique constraint violation - relationship already exists, ignore
  }
}

/**
 * Hand a structured claim to the Claim Steward for assessment. The steward owns
 * the claim's judgment over time (#30): it traverses subclaims/related claims,
 * always has web_search, consumes instance stance, and re-judges as evidence and
 * depended-on claims change.
 */
async function enqueueAssessment(claimId: string, context: string): Promise<void> {
  await enqueueSteward({
    claimId,
    trigger: "initial_assessment",
    context,
  });
}
