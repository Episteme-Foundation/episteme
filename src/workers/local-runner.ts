/**
 * In-process queue runner.
 *
 * Drives the whole agent organization without external infrastructure. Two kinds
 * of work are interleaved here:
 *  - the in-memory queues (claim-pipeline, curator, contribution, arbitration,
 *    audit, url-extraction) — populated by enqueue* when no SQS queue is set; and
 *  - the DB-backed Steward queue (claims with steward_state='pending'), drained
 *    highest-importance-first by steward-pipeline.ts.
 *
 * The Steward queue is NOT in-memory: it lives in the `claims` table, so it is
 * the SAME mechanism in dev and prod (prod just also runs SQS pollers for the
 * ingestion queues). `drainLocalQueues()` runs everything to quiescence (used by
 * the corpus harness); `startLocalRunner()` polls continuously (dev server AND
 * prod, so the Steward/Curator actually run everywhere — previously they were
 * enqueued in prod but never drained).
 */
import { getLocalQueue } from "../services/queue-service.js";
import { handleClaimPipeline } from "./claim-pipeline.js";
import { handleUrlExtraction } from "./url-extraction.js";
import { handleCuratorMessage } from "./curator-pipeline.js";
import { handleContributionMessage } from "./contribution-pipeline.js";
import { handleArbitrationMessage } from "./arbitration-pipeline.js";
import { handleAuditMessage } from "./audit-pipeline.js";
import { processNextStewardTask, pendingStewardCount } from "./steward-pipeline.js";
import { checkBudget } from "../llm/budget-tracker.js";
import { LlmBudgetExceededError } from "../llm/errors.js";
import { loadConfig } from "../config.js";

export type LocalQueueName =
  | "claimPipeline"
  | "curator"
  | "contribution"
  | "arbitration"
  | "audit"
  | "urlExtraction";

// Priority order for the in-memory queues. The Steward is handled separately
// (DB-backed, importance-ordered) and drained between in-memory passes.
const HANDLERS: Array<[LocalQueueName, (m: never) => Promise<void>]> = [
  ["claimPipeline", handleClaimPipeline as (m: never) => Promise<void>],
  ["curator", handleCuratorMessage as (m: never) => Promise<void>],
  ["contribution", handleContributionMessage as (m: never) => Promise<void>],
  ["arbitration", handleArbitrationMessage as (m: never) => Promise<void>],
  ["audit", handleAuditMessage as (m: never) => Promise<void>],
  ["urlExtraction", handleUrlExtraction as (m: never) => Promise<void>],
];

/** One processed message — the unit of the observability trace. */
export interface RunnerEvent {
  seq: number;
  queue: LocalQueueName | "steward";
  message: unknown;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export interface DrainStats {
  processed: Record<string, number>;
  errors: Record<string, number>;
  capped: boolean;
}

export interface DrainOptions {
  /** Safety cap on total messages, to bound runaway propagation loops. */
  maxMessages?: number;
  /** Observer called after every processed message (for tracing). */
  onEvent?: (e: RunnerEvent) => void;
  /** Monotonic clock; injectable so callers control timestamps. Defaults to Date.now. */
  now?: () => number;
  /** Override the Steward model (defaults to config.stewardModel). */
  stewardModel?: string;
  /**
   * Cap on Steward tasks processed in this drain (cost backstop). Defaults to
   * STEWARD_MAX_RUNS (0 = unlimited). When the cap is reached, remaining pending
   * claims are left as embedded stubs — the intended under-budget steady state.
   */
  maxStewardTasks?: number;
}

function inMemoryPending(): boolean {
  return HANDLERS.some(([name]) => getLocalQueue(name).length > 0);
}

/** Remove and return the next FIFO message for an in-memory queue. */
function dequeue(name: LocalQueueName): unknown {
  return (getLocalQueue(name) as unknown[]).shift();
}

/**
 * Process every queued message — in-memory queues AND the DB-backed Steward
 * queue — until all are quiescent (or the safety cap is hit). Budget-exceeded
 * errors propagate so the caller can stop; other handler errors are counted and
 * skipped, mirroring the SQS poller.
 *
 * In-memory work is drained first each round; then one Steward task is processed
 * (it may enqueue Curator work in-memory and mint new pending subclaims), and the
 * loop repeats — so the two queues settle together.
 */
export async function drainLocalQueues(opts: DrainOptions = {}): Promise<DrainStats> {
  const cap = opts.maxMessages ?? 20_000;
  const now = opts.now ?? Date.now;
  const { stewardMaxRuns } = loadConfig();
  const stewardCap =
    opts.maxStewardTasks ?? (stewardMaxRuns > 0 ? stewardMaxRuns : Number.POSITIVE_INFINITY);
  const processed: Record<string, number> = {};
  const errors: Record<string, number> = {};
  let stewardProcessed = 0;
  let seq = 0;

  while (seq < cap) {
    // 1. Drain a ready in-memory message if any.
    const entry = HANDLERS.find(([name]) => getLocalQueue(name).length > 0);
    if (entry) {
      const [name, handler] = entry;
      const message = dequeue(name) as never;
      const startedAt = now();
      seq++;
      try {
        await handler(message);
        processed[name] = (processed[name] ?? 0) + 1;
        opts.onEvent?.({ seq, queue: name, message, ok: true, durationMs: now() - startedAt });
      } catch (err) {
        if (err instanceof LlmBudgetExceededError) throw err;
        errors[name] = (errors[name] ?? 0) + 1;
        opts.onEvent?.({
          seq,
          queue: name,
          message,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: now() - startedAt,
        });
      }
      continue;
    }

    // 2. No in-memory work — try one Steward task (highest importance pending),
    //    unless the per-drain Steward budget is spent (leave the rest as stubs).
    if (stewardProcessed >= stewardCap) {
      return { processed, errors, capped: (await pendingStewardCount()) > 0 };
    }
    const startedAt = now();
    const r = await processNextStewardTask({ model: opts.stewardModel });
    if (r.status === "empty") {
      // Both the in-memory queues and the Steward queue are drained.
      return { processed, errors, capped: false };
    }
    if (r.status === "budget") {
      // Surface the real budget error so the run stops and reports cleanly.
      checkBudget();
      return { processed, errors, capped: false };
    }
    if (r.status === "transient") {
      // A transient API/infra failure (billing/credit/429/5xx/network). The
      // claim was requeued untouched (#97). Stop this pass cleanly — the API is
      // struggling — leaving the queue for the next interval to retry.
      return { processed, errors, capped: (await pendingStewardCount()) > 0 };
    }
    seq++;
    stewardProcessed++;
    if (r.ok) {
      processed.steward = (processed.steward ?? 0) + 1;
    } else {
      errors.steward = (errors.steward ?? 0) + 1;
    }
    opts.onEvent?.({
      seq,
      queue: "steward",
      message: { claimId: r.claimId, trigger: r.trigger },
      ok: !!r.ok,
      error: r.error,
      durationMs: now() - startedAt,
    });
  }

  return { processed, errors, capped: inMemoryPending() };
}

/**
 * Continuously drain the queues on an interval. Used in BOTH dev and prod (in
 * prod alongside the SQS ingestion pollers) so the Steward and Curator actually
 * run everywhere. Budget errors pause the loop briefly (like the SQS poller)
 * rather than killing it.
 */
export function startLocalRunner(options: {
  intervalMs?: number;
  logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  maxMessages?: number;
  stewardModel?: string;
}): { stop: () => void } {
  const interval = options.intervalMs ?? 500;
  let running = true;
  let busy = false;

  const tick = async () => {
    if (!running || busy) return;
    busy = true;
    try {
      await drainLocalQueues({
        maxMessages: options.maxMessages,
        stewardModel: options.stewardModel,
      });
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        options.logger.error("Budget exceeded, pausing local runner for 60s:", err.message);
        await new Promise((r) => setTimeout(r, 60_000));
      } else {
        options.logger.error("Local runner error", err instanceof Error ? err.message : err);
      }
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), interval);
  options.logger.info("In-process queue runner started (in-memory queues + DB Steward drain)");

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
