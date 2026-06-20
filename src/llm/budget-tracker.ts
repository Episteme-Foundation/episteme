import { loadConfig } from "../config.js";
import { LlmBudgetExceededError } from "./errors.js";

interface BudgetCounters {
  hourlyCallCount: number;
  hourlyTokenCount: number;
  dailyCallCount: number;
  dailyTokenCount: number;
  currentHour: number;
  currentDay: number;
}

let _counters: BudgetCounters = {
  hourlyCallCount: 0,
  hourlyTokenCount: 0,
  dailyCallCount: 0,
  dailyTokenCount: 0,
  currentHour: Math.floor(Date.now() / 3_600_000),
  currentDay: Math.floor(Date.now() / 86_400_000),
};

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
 */
export function recordUsage(inputTokens: number, outputTokens: number): void {
  rolloverIfNeeded();
  const totalTokens = inputTokens + outputTokens;
  _counters.hourlyCallCount += 1;
  _counters.dailyCallCount += 1;
  _counters.hourlyTokenCount += totalTokens;
  _counters.dailyTokenCount += totalTokens;
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
  _counters = {
    hourlyCallCount: 0,
    hourlyTokenCount: 0,
    dailyCallCount: 0,
    dailyTokenCount: 0,
    currentHour: Math.floor(Date.now() / 3_600_000),
    currentDay: Math.floor(Date.now() / 86_400_000),
  };
}
