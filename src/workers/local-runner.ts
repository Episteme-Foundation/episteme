/**
 * Local in-memory queue runner.
 *
 * Production drains work via SQS pollers (poller.ts). Locally there is no SQS,
 * so enqueue* pushes onto the in-memory arrays in queue-service.ts — and without
 * this module nothing consumes them. This is the missing local consumer: it
 * dispatches each queued message to the same worker handlers the SQS pollers
 * use, so the whole agent organization runs end-to-end locally (npm run dev) and
 * in the corpus test harness.
 *
 * Two entry points:
 *  - drainLocalQueues(): process every queue to quiescence once (used by the
 *    test harness, which injects inputs then drains to a stable state).
 *  - startLocalRunner(): poll continuously (used by the dev server).
 *
 * Messages are taken in a fixed priority order so decomposition/assessment
 * settle before stewardship propagation, conflict review, escalation, and
 * arbitration fan out — mirroring a system draining toward a stable state.
 */
import { getLocalQueue } from "../services/queue-service.js";
import { handleClaimPipeline } from "./claim-pipeline.js";
import { handleUrlExtraction } from "./url-extraction.js";
import { handleStewardMessage } from "./steward-pipeline.js";
import { handleContributionMessage } from "./contribution-pipeline.js";
import { handleArbitrationMessage } from "./arbitration-pipeline.js";
import { handleAuditMessage } from "./audit-pipeline.js";
import { LlmBudgetExceededError } from "../llm/errors.js";

export type LocalQueueName =
  | "claimPipeline"
  | "steward"
  | "contribution"
  | "arbitration"
  | "audit"
  | "urlExtraction";

// Priority order: finish decomposition/assessment before stewardship
// propagation, conflict review, escalation, arbitration, then audit.
const HANDLERS: Array<[LocalQueueName, (m: never) => Promise<void>]> = [
  ["claimPipeline", handleClaimPipeline as (m: never) => Promise<void>],
  ["steward", handleStewardMessage as (m: never) => Promise<void>],
  ["contribution", handleContributionMessage as (m: never) => Promise<void>],
  ["arbitration", handleArbitrationMessage as (m: never) => Promise<void>],
  ["audit", handleAuditMessage as (m: never) => Promise<void>],
  ["urlExtraction", handleUrlExtraction as (m: never) => Promise<void>],
];

/** One processed message — the unit of the observability trace. */
export interface RunnerEvent {
  seq: number;
  queue: LocalQueueName;
  message: unknown;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export interface DrainStats {
  processed: Partial<Record<LocalQueueName, number>>;
  errors: Partial<Record<LocalQueueName, number>>;
  capped: boolean;
}

export interface DrainOptions {
  /** Safety cap on total messages, to bound runaway propagation loops. */
  maxMessages?: number;
  /** Observer called after every processed message (for tracing). */
  onEvent?: (e: RunnerEvent) => void;
  /** Monotonic clock; injectable so callers control timestamps. Defaults to Date.now. */
  now?: () => number;
}

function pending(): boolean {
  return HANDLERS.some(([name]) => getLocalQueue(name).length > 0);
}

/**
 * Process every queued message across all local queues until all are empty (or
 * the safety cap is hit). Budget-exceeded errors propagate so the caller can
 * stop; all other handler errors are counted and skipped, mirroring the SQS
 * poller (which logs and moves on rather than aborting the batch).
 */
export async function drainLocalQueues(opts: DrainOptions = {}): Promise<DrainStats> {
  const cap = opts.maxMessages ?? 20_000;
  const now = opts.now ?? Date.now;
  const processed: Partial<Record<LocalQueueName, number>> = {};
  const errors: Partial<Record<LocalQueueName, number>> = {};
  let seq = 0;

  while (seq < cap) {
    const entry = HANDLERS.find(([name]) => getLocalQueue(name).length > 0);
    if (!entry) return { processed, errors, capped: false };
    const [name, handler] = entry;
    const message = getLocalQueue(name).shift() as never;
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
  }

  return { processed, errors, capped: pending() };
}

/**
 * Continuously drain the local queues on an interval. Used by the dev server in
 * place of the SQS pollers when no SQS queues are configured. Budget errors
 * pause the loop briefly (like the SQS poller) rather than killing it.
 */
export function startLocalRunner(options: {
  intervalMs?: number;
  logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  maxMessages?: number;
}): { stop: () => void } {
  const interval = options.intervalMs ?? 500;
  let running = true;
  let busy = false;

  const tick = async () => {
    if (!running || busy || !pending()) return;
    busy = true;
    try {
      await drainLocalQueues({ maxMessages: options.maxMessages });
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
  options.logger.info("Local in-memory queue runner started");

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
