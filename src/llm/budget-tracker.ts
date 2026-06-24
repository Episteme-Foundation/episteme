import { loadConfig } from "../config.js";
import { LlmBudgetExceededError } from "./errors.js";

interface BudgetCounters {
  hourlyCallCount: number;
  hourlyTokenCount: number;
  dailyCallCount: number;
  dailyTokenCount: number;
  currentHour: number;
  currentDay: number;
  // Session totals — cumulative for the lifetime of the process, never rolled
  // over. These power the per-run cost report (and a meaningful $ estimate),
  // which the hourly/daily limits — a coarse input+output token sum that ignores
  // cache reads and output weighting — cannot give on their own.
  sessionCalls: number;
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionCacheReadTokens: number;
  sessionCacheCreationTokens: number;
}

function freshCounters(): BudgetCounters {
  return {
    hourlyCallCount: 0,
    hourlyTokenCount: 0,
    dailyCallCount: 0,
    dailyTokenCount: 0,
    currentHour: Math.floor(Date.now() / 3_600_000),
    currentDay: Math.floor(Date.now() / 86_400_000),
    sessionCalls: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadTokens: 0,
    sessionCacheCreationTokens: 0,
  };
}

let _counters: BudgetCounters = freshCounters();

function rolloverIfNeeded(): void {
  const now = Date.now();
  const currentHour = Math.floor(now / 3_600_000);
  const currentDay = Math.floor(now / 86_400_000);

  if (currentHour !== _counters.currentHour) {
    _counters.hourlyCallCount = 0;
    _counters.hourlyTokenCount = 0;
    _counters.currentHour = currentHour;
  }
  if (currentDay !== _counters.currentDay) {
    _counters.dailyCallCount = 0;
    _counters.dailyTokenCount = 0;
    _counters.currentDay = currentDay;
  }
}

/**
 * Check limits before making an LLM call. Throws if any limit is exceeded.
 */
export function checkBudget(): void {
  rolloverIfNeeded();
  const config = loadConfig();

  if (
    config.llmHourlyCallLimit > 0 &&
    _counters.hourlyCallCount >= config.llmHourlyCallLimit
  ) {
    throw new LlmBudgetExceededError(
      "hourly_call_count",
      _counters.hourlyCallCount,
      config.llmHourlyCallLimit
    );
  }

  if (
    config.llmDailyCallLimit > 0 &&
    _counters.dailyCallCount >= config.llmDailyCallLimit
  ) {
    throw new LlmBudgetExceededError(
      "daily_call_count",
      _counters.dailyCallCount,
      config.llmDailyCallLimit
    );
  }

  if (
    config.llmHourlyTokenLimit > 0 &&
    _counters.hourlyTokenCount >= config.llmHourlyTokenLimit
  ) {
    throw new LlmBudgetExceededError(
      "hourly_token_count",
      _counters.hourlyTokenCount,
      config.llmHourlyTokenLimit
    );
  }

  if (
    config.llmDailyTokenLimit > 0 &&
    _counters.dailyTokenCount >= config.llmDailyTokenLimit
  ) {
    throw new LlmBudgetExceededError(
      "daily_token_count",
      _counters.dailyTokenCount,
      config.llmDailyTokenLimit
    );
  }
}

/**
 * Record usage after a successful LLM call.
 *
 * `inputTokens` / `outputTokens` are the (uncached) input and output token
 * counts. The optional cache fields let the session totals — and the per-run
 * cost estimate — account for prompt caching, where cache *reads* are ~10x
 * cheaper than fresh input. The hourly/daily LIMIT counters intentionally keep
 * summing only uncached input+output (their historical behavior) so a large but
 * cheap cache-read prefix doesn't trip the circuit breaker prematurely.
 */
export function recordUsage(
  inputTokens: number,
  outputTokens: number,
  cache?: { readTokens?: number; creationTokens?: number }
): void {
  rolloverIfNeeded();
  const totalTokens = inputTokens + outputTokens;
  _counters.hourlyCallCount += 1;
  _counters.dailyCallCount += 1;
  _counters.hourlyTokenCount += totalTokens;
  _counters.dailyTokenCount += totalTokens;

  _counters.sessionCalls += 1;
  _counters.sessionInputTokens += inputTokens;
  _counters.sessionOutputTokens += outputTokens;
  _counters.sessionCacheReadTokens += cache?.readTokens ?? 0;
  _counters.sessionCacheCreationTokens += cache?.creationTokens ?? 0;
}

export interface SessionUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** Cumulative token usage for this process — for per-run cost reporting. */
export function getSessionUsage(): SessionUsage {
  return {
    calls: _counters.sessionCalls,
    inputTokens: _counters.sessionInputTokens,
    outputTokens: _counters.sessionOutputTokens,
    cacheReadTokens: _counters.sessionCacheReadTokens,
    cacheCreationTokens: _counters.sessionCacheCreationTokens,
  };
}

/**
 * Get current counters for health/monitoring endpoints.
 */
export function getBudgetStatus(): Readonly<BudgetCounters> {
  rolloverIfNeeded();
  return { ..._counters };
}

/**
 * Reset counters (for testing).
 */
export function resetBudgetCounters(): void {
  _counters = freshCounters();
}
