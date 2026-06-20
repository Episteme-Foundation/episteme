/**
 * In-process driver for the full agent organization.
 *
 * Locally there is no SQS and nothing drains the in-memory queues, so we call
 * the worker handlers directly. This is not ingestion-only: handlers enqueue
 * follow-up work across queues (claim-pipeline -> steward; steward ->
 * steward/contribution; contribution-reviewer -> arbitration/steward;
 * arbitrator -> steward; audit -> contribution). drainAll() runs every queue to
 * quiescence so we can observe whether the whole organization settles correctly
 * — decomposition, assessment, stewardship propagation, conflict review,
 * escalation, and arbitration.
 *
 * Messages are processed one at a time, always taking the highest-priority
 * non-empty queue, so claim decomposition completes before stewardship
 * propagation fans out, mirroring a system draining toward a stable state.
 */
import { getLocalQueue } from "../../src/services/queue-service.js";
import { handleClaimPipeline } from "../../src/workers/claim-pipeline.js";
import { handleUrlExtraction } from "../../src/workers/url-extraction.js";
import { handleStewardMessage } from "../../src/workers/steward-pipeline.js";
import { handleContributionMessage } from "../../src/workers/contribution-pipeline.js";
import { handleArbitrationMessage } from "../../src/workers/arbitration-pipeline.js";
import { handleAuditMessage } from "../../src/workers/audit-pipeline.js";
import { LlmBudgetExceededError } from "../../src/llm/errors.js";

type QueueName =
  | "claimPipeline"
  | "steward"
  | "contribution"
  | "arbitration"
  | "audit"
  | "urlExtraction";

// Priority order: finish decomposition/assessment before stewardship
// propagation, conflict review, escalation, arbitration, then audit.
const HANDLERS: Array<[QueueName, (m: never) => Promise<void>]> = [
  ["claimPipeline", handleClaimPipeline as (m: never) => Promise<void>],
  ["steward", handleStewardMessage as (m: never) => Promise<void>],
  ["contribution", handleContributionMessage as (m: never) => Promise<void>],
  ["arbitration", handleArbitrationMessage as (m: never) => Promise<void>],
  ["audit", handleAuditMessage as (m: never) => Promise<void>],
  ["urlExtraction", handleUrlExtraction as (m: never) => Promise<void>],
];

export interface DrainStats {
  /** Messages successfully processed, per queue. */
  processed: Partial<Record<QueueName, number>>;
  /** Per-queue counts of handler errors that were swallowed and skipped. */
  errors: Partial<Record<QueueName, number>>;
  /** True if the safety cap was hit before reaching quiescence. */
  capped: boolean;
}

export interface DrainOptions {
  /** Safety cap on total messages, to bound runaway propagation loops. */
  maxMessages?: number;
  /** Notified on each swallowed (non-budget) handler error. */
  onError?: (queue: QueueName, err: unknown) => void;
}

/**
 * Process every queued message across all local queues until all are empty
 * (or the safety cap is hit). Budget-exceeded errors propagate (so the caller
 * can stop the run); all other handler errors are counted and skipped, mirroring
 * the production poller, which logs and moves on rather than aborting the batch.
 */
export async function drainAll(opts: DrainOptions = {}): Promise<DrainStats> {
  const cap = opts.maxMessages ?? 20_000;
  const processed: Partial<Record<QueueName, number>> = {};
  const errors: Partial<Record<QueueName, number>> = {};
  let total = 0;

  while (total < cap) {
    const entry = HANDLERS.find(([name]) => getLocalQueue(name).length > 0);
    if (!entry) return { processed, errors, capped: false }; // quiescence
    const [name, handler] = entry;
    const message = getLocalQueue(name).shift() as never;
    total++;
    try {
      await handler(message);
      processed[name] = (processed[name] ?? 0) + 1;
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) throw err;
      errors[name] = (errors[name] ?? 0) + 1;
      opts.onError?.(name, err);
    }
  }

  const stillQueued = HANDLERS.some(([name]) => getLocalQueue(name).length > 0);
  return { processed, errors, capped: stillQueued };
}

/** Total messages processed across all queues (for concise logging). */
export function totalProcessed(stats: DrainStats): number {
  return Object.values(stats.processed).reduce((a, b) => a + b, 0);
}
