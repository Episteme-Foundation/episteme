import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  claims,
  claimRelationships,
  claimInstances,
  sources,
  assessments,
} from "../db/schema.js";
import { decomposeClaim } from "../llm/agents/decomposer.js";
import { assessAtomicClaim, assessClaim } from "../llm/agents/assessor.js";
import { generateEmbedding } from "../services/embedding-service.js";
import { findSimilarClaims } from "../services/search-service.js";
import { addArgument } from "../services/argument-service.js";
import { enqueueClaimPipeline, enqueueSteward } from "../services/queue-service.js";
import { loadConfig } from "../config.js";
import type { ClaimPipelineMessage } from "../services/queue-service.js";

/**
 * Handle a claim pipeline message. Each message = one LLM call + DB writes + enqueue follow-ups.
 *
 * Flow:
 * 1. Decompose the claim into subclaims (one LLM call)
 * 2. For each subclaim:
 *    a. Match against existing claims (pgvector cosine search)
 *    b. If match: create relationship, done
 *    c. If new: create claim, generate embedding, enqueue to claim-pipeline
 * 3. If atomic: enqueue for assessment
 * 4. When all children assessed: enqueue parent for assessment
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
      // Mark as atomic and assess
      await db
        .update(claims)
        .set({ decompositionStatus: "atomic", updatedAt: new Date() })
        .where(eq(claims.id, message.claimId));

      await assessAndStore(message.claimId, claim.text, claim.claimType, true);
      await checkParentCompletion(message.claimId, message.jobId);
      return;
    }

    // Decompose
    const result = await decomposeClaim({
      claimText: claim.text,
      claimType: claim.claimType,
    });

    if (result.is_atomic || result.subclaims.length === 0) {
      // Atomic claim - assess directly
      await db
        .update(claims)
        .set({ decompositionStatus: "atomic", updatedAt: new Date() })
        .where(eq(claims.id, message.claimId));

      await assessAndStore(
        message.claimId,
        claim.text,
        claim.claimType,
        true,
        result.atomic_type
      );
      await checkParentCompletion(message.claimId, message.jobId);
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

    // Update parent with children count
    await db
      .update(claims)
      .set({
        decompositionStatus: "complete",
        childrenTotal,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, message.claimId));

    // If no children need processing, assess now
    if (childrenTotal === 0) {
      await assessAndStore(message.claimId, claim.text, claim.claimType, true);
      await checkParentCompletion(message.claimId, message.jobId);
    }
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
      relationType,
      reasoning,
      confidence,
      argumentId: argumentId ?? null,
    });
  } catch {
    // Unique constraint violation - relationship already exists, ignore
  }
}

async function assessAndStore(
  claimId: string,
  claimText: string,
  claimType: string,
  isAtomic: boolean,
  atomicType?: string | null
): Promise<void> {
  const db = getDb();

  try {
    let result;

    if (isAtomic) {
      // Fetch instances for this claim
      const claimInstanceRows = await db
        .select({
          source_title: sources.title,
          source_type: sources.sourceType,
          original_text: claimInstances.originalText,
          confidence: claimInstances.confidence,
        })
        .from(claimInstances)
        .innerJoin(sources, eq(claimInstances.sourceId, sources.id))
        .where(eq(claimInstances.claimId, claimId))
        .limit(10);

      result = await assessAtomicClaim({
        claimText,
        claimType,
        atomicType: atomicType ?? null,
        instances: claimInstanceRows.map((r) => ({
          source_title: r.source_title,
          source_type: r.source_type,
          original_text: r.original_text,
          confidence: Number(r.confidence),
        })),
      });
    } else {
      // Get subclaim assessments
      const subclaims = await getSubclaimAssessments(claimId);
      result = await assessClaim({
        claimText,
        claimType,
        subclaims,
      });
    }

    // Mark previous assessment as non-current
    await db
      .update(assessments)
      .set({ isCurrent: false })
      .where(eq(assessments.claimId, claimId));

    // Store new assessment
    await db.insert(assessments).values({
      claimId,
      status: result.status,
      confidence: result.confidence,
      reasoningTrace: result.reasoning_trace,
      subclaimSummary: result.subclaim_summary,
    });
  } catch {
    // Assessment failed - claim will stay without assessment
  }
}

async function getSubclaimAssessments(claimId: string): Promise<
  Array<{
    canonical_form: string;
    relation: string;
    status: string;
    confidence: number;
    reasoning: string;
  }>
> {
  const db = getDb();

  const rows = await db
    .select({
      text: claims.text,
      claimType: claims.claimType,
      relationType: claimRelationships.relationType,
      status: assessments.status,
      confidence: assessments.confidence,
      reasoningTrace: assessments.reasoningTrace,
    })
    .from(claimRelationships)
    .innerJoin(claims, eq(claims.id, claimRelationships.childClaimId))
    .leftJoin(
      assessments,
      sql`${assessments.claimId} = ${claimRelationships.childClaimId} AND ${assessments.isCurrent} = true`
    )
    .where(eq(claimRelationships.parentClaimId, claimId));

  return rows.map((r) => ({
    canonical_form: r.text,
    relation: r.relationType,
    status: r.status ?? "unknown",
    confidence: r.confidence ?? 0,
    reasoning: r.reasoningTrace ?? "Not yet assessed",
  }));
}

/**
 * When a child is assessed, check if all siblings are done.
 * If so, enqueue the parent for assessment.
 */
async function checkParentCompletion(
  childClaimId: string,
  jobId: string
): Promise<void> {
  const db = getDb();

  // Find all parents
  const parents = await db
    .select({ parentClaimId: claimRelationships.parentClaimId })
    .from(claimRelationships)
    .where(eq(claimRelationships.childClaimId, childClaimId));

  for (const parent of parents) {
    // Atomically increment children_assessed
    const [updated] = await db
      .update(claims)
      .set({
        childrenAssessed: sql`${claims.childrenAssessed} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, parent.parentClaimId))
      .returning();

    if (updated && updated.childrenAssessed >= updated.childrenTotal && updated.childrenTotal > 0) {
      // All children assessed - assess the parent
      await assessAndStore(
        updated.id,
        updated.text,
        updated.claimType,
        false
      );

      // Enqueue steward to evaluate whether the assessment change
      // is material enough to propagate to dependents
      await enqueueSteward({
        claimId: updated.id,
        trigger: "subclaim_change",
        context: `All ${updated.childrenTotal} subclaims assessed. Parent claim reassessed.`,
      });

      // Propagate upward
      await checkParentCompletion(updated.id, jobId);
    }
  }
}
