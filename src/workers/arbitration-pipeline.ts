/**
 * Arbitration pipeline worker.
 *
 * Wraps the Dispute Arbitrator agent in a crash-safe claim (#218), like
 * contribution-pipeline.ts. The claimed row depends on the flavor:
 *  - appeal-driven arbitration claims the appeal row (status='pending');
 *  - reviewer escalation (no appealId) claims the contribution row
 *    (review_status='escalated').
 * Either way, duplicate messages no-op and a crashed run is reclaimable after
 * the window. Budget errors release the claim and refund the attempt; other
 * errors keep it (reclaim-window backoff, attempt cap parks poisoned rows).
 */
import type { ArbitrationMessage } from "../services/queue-service.js";
import { runArbitration } from "../llm/agents/dispute-arbitrator.js";
import { rawQuery } from "../db/client.js";
import { LlmBudgetExceededError } from "../llm/errors.js";
import {
  MAX_REVIEW_ATTEMPTS,
  REVIEW_RECLAIM_MINUTES,
} from "./contribution-pipeline.js";

async function claimWork(message: ArbitrationMessage): Promise<boolean> {
  if (message.appealId) {
    const rows = await rawQuery<{ id: string }>(
      `UPDATE appeals
          SET claimed_at = now(),
              arbitration_attempts = arbitration_attempts + 1
        WHERE id = $1
          AND status = 'pending'
          AND (claimed_at IS NULL
               OR claimed_at < now() - interval '${REVIEW_RECLAIM_MINUTES} minutes')
          AND arbitration_attempts < ${MAX_REVIEW_ATTEMPTS}
        RETURNING id`,
      [message.appealId]
    );
    return rows.length > 0;
  }
  const rows = await rawQuery<{ id: string }>(
    `UPDATE contributions
        SET review_claimed_at = now(),
            review_attempts = review_attempts + 1
      WHERE id = $1
        AND review_status = 'escalated'
        AND (review_claimed_at IS NULL
             OR review_claimed_at < now() - interval '${REVIEW_RECLAIM_MINUTES} minutes')
        AND review_attempts < ${MAX_REVIEW_ATTEMPTS}
      RETURNING id`,
    [message.contributionId]
  );
  return rows.length > 0;
}

async function releaseClaim(message: ArbitrationMessage): Promise<void> {
  if (message.appealId) {
    await rawQuery(
      `UPDATE appeals
          SET claimed_at = NULL,
              arbitration_attempts = arbitration_attempts - 1
        WHERE id = $1 AND status = 'pending'`,
      [message.appealId]
    );
    return;
  }
  await rawQuery(
    `UPDATE contributions
        SET review_claimed_at = NULL,
            review_attempts = review_attempts - 1
      WHERE id = $1 AND review_status = 'escalated'`,
    [message.contributionId]
  );
}

export async function handleArbitrationMessage(
  message: ArbitrationMessage
): Promise<void> {
  if (!(await claimWork(message))) return; // resolved, in flight, or parked

  try {
    await runArbitration({
      contributionId: message.contributionId,
      trigger: message.trigger,
      appealId: message.appealId,
    });
  } catch (err) {
    if (err instanceof LlmBudgetExceededError) await releaseClaim(message);
    throw err;
  }
}
