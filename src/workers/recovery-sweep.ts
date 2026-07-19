/**
 * Recovery sweep (#218).
 *
 * The Curator/Contribution/Arbitration queues are in-memory: a process restart
 * (deploy, crash, scale-in) loses whatever was queued, and a handler that
 * throws after dequeue loses that message. For the work that has a durable
 * row — contributions awaiting review, escalated contributions awaiting
 * arbitration, appeals awaiting arbitration — the row itself is the source of
 * truth, so this sweep periodically re-enqueues any row that is still in a
 * waiting status with no live claim. The pipeline handlers' atomic claim
 * (contribution-pipeline.ts / arbitration-pipeline.ts) makes duplicate
 * enqueues no-op, so sweeping is safe across multiple processes.
 *
 * Rows that have exhausted MAX_REVIEW_ATTEMPTS are left alone (parked) and
 * surfaced in the sweep's log line — they need operator attention, not more
 * spend. Curator messages have no durable row and stay best-effort.
 */
import { rawQuery } from "../db/client.js";
import {
  enqueueArbitration,
  enqueueContribution,
} from "../services/queue-service.js";
import {
  MAX_REVIEW_ATTEMPTS,
  REVIEW_RECLAIM_MINUTES,
} from "./contribution-pipeline.js";

/** Don't re-enqueue rows younger than this — their original message is
 * almost certainly still queued or in flight. */
const SWEEP_GRACE_MINUTES = 2;

export interface SweepStats {
  contributionsRequeued: number;
  escalationsRequeued: number;
  appealsRequeued: number;
  parked: number;
}

export async function sweepStalledReviewWork(): Promise<SweepStats> {
  const stale = `(review_claimed_at IS NULL
                  OR review_claimed_at < now() - interval '${REVIEW_RECLAIM_MINUTES} minutes')`;

  const pending = await rawQuery<{ id: string }>(
    `SELECT id FROM contributions
      WHERE review_status = 'pending'
        AND submitted_at < now() - interval '${SWEEP_GRACE_MINUTES} minutes'
        AND ${stale}
        AND review_attempts < ${MAX_REVIEW_ATTEMPTS}`
  );
  for (const row of pending) {
    await enqueueContribution({ contributionId: row.id });
  }

  const escalated = await rawQuery<{ id: string }>(
    `SELECT id FROM contributions
      WHERE review_status = 'escalated'
        AND ${stale}
        AND review_attempts < ${MAX_REVIEW_ATTEMPTS}`
  );
  for (const row of escalated) {
    await enqueueArbitration({
      contributionId: row.id,
      trigger: "escalated_review",
    });
  }

  const appeals = await rawQuery<{ id: string; contribution_id: string }>(
    `SELECT id, contribution_id FROM appeals
      WHERE status = 'pending'
        AND submitted_at < now() - interval '${SWEEP_GRACE_MINUTES} minutes'
        AND (claimed_at IS NULL
             OR claimed_at < now() - interval '${REVIEW_RECLAIM_MINUTES} minutes')
        AND arbitration_attempts < ${MAX_REVIEW_ATTEMPTS}`
  );
  for (const row of appeals) {
    await enqueueArbitration({
      contributionId: row.contribution_id,
      trigger: "appeal",
      appealId: row.id,
    });
  }

  const parked = await rawQuery<{ n: number }>(
    `SELECT (SELECT count(*) FROM contributions
              WHERE review_status IN ('pending', 'escalated')
                AND review_attempts >= ${MAX_REVIEW_ATTEMPTS})
          + (SELECT count(*) FROM appeals
              WHERE status = 'pending'
                AND arbitration_attempts >= ${MAX_REVIEW_ATTEMPTS}) AS n`
  );

  return {
    contributionsRequeued: pending.length,
    escalationsRequeued: escalated.length,
    appealsRequeued: appeals.length,
    parked: Number(parked[0]?.n ?? 0),
  };
}

/**
 * Run the sweep on an interval (and once at startup, so a deploy immediately
 * re-drives whatever the previous process lost). Sweep failures are logged and
 * skipped — the next interval retries; the sweep must never take the runner
 * down with it.
 */
export function startRecoverySweep(options: {
  intervalMs?: number;
  logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
}): { stop: () => void } {
  const interval = options.intervalMs ?? 60_000;
  let running = true;

  const sweep = async () => {
    if (!running) return;
    try {
      const stats = await sweepStalledReviewWork();
      const requeued =
        stats.contributionsRequeued + stats.escalationsRequeued + stats.appealsRequeued;
      if (requeued > 0 || stats.parked > 0) {
        options.logger.info(
          `[recovery-sweep] requeued ${stats.contributionsRequeued} reviews, ` +
            `${stats.escalationsRequeued} escalations, ${stats.appealsRequeued} appeals` +
            (stats.parked > 0
              ? `; ${stats.parked} parked at the attempt cap — needs an operator`
              : "")
        );
      }
    } catch (err) {
      options.logger.error(
        "[recovery-sweep] failed:",
        err instanceof Error ? err.message : err
      );
    }
  };

  void sweep();
  const timer = setInterval(() => void sweep(), interval);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
