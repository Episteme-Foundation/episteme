import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { claims } from "../db/schema.js";
import { enqueueSteward } from "../services/queue-service.js";
import type { ClaimPipelineMessage } from "../services/queue-service.js";

/**
 * Claim onboarding dispatcher.
 *
 * This is the single entry point for a newly created claim (from URL extraction
 * or the API). It does NOT decompose, match, or assess — all of that is the
 * Claim Steward's job now: the Steward owns the claim's structure (it decomposes
 * and, via match_claim, links existing claims or creates new ones) and its
 * assessment (constitution Part VII). Onboarding just hands the claim to its
 * Steward.
 *
 * Termination is guaranteed without a depth limit: the Steward calls match_claim
 * before creating any subclaim, so any pre-existing claim (including an ancestor)
 * is found and merely linked — only genuinely new claims enqueue further work.
 * Spend is bounded globally by stewardMaxRuns and the LLM budget tracker, not by
 * decomposition depth.
 */
export async function handleClaimPipeline(
  message: ClaimPipelineMessage
): Promise<void> {
  const db = getDb();

  const [claim] = await db
    .select({
      id: claims.id,
      decompositionStatus: claims.decompositionStatus,
    })
    .from(claims)
    .where(eq(claims.id, message.claimId))
    .limit(1);

  if (!claim) return;

  // Idempotency: only onboard once. "complete" here means "handed to the
  // Steward, which owns ongoing structure" — not that decomposition is frozen.
  if (claim.decompositionStatus === "complete") return;

  await db
    .update(claims)
    .set({ decompositionStatus: "complete", updatedAt: new Date() })
    .where(eq(claims.id, message.claimId));

  await enqueueSteward({
    claimId: message.claimId,
    trigger: "structure_and_assess",
    context:
      "New claim onboarded. Structure it (decompose, calling match_claim for each " +
      "dependency to link existing claims or create new ones), then assess it.",
  });
}
