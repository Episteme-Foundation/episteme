import { loadConfig } from "../config.js";
import { BedrockBudgetExceededError } from "./errors.js";

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
 * Check limits before making a Bedrock call. Throws if any limit is exceeded.
 */
export function checkBudget(): void {
  rolloverIfNeeded();
  const config = loadConfig();

  if (
    config.bedrockHourlyCallLimit > 0 &&
    _counters.hourlyCallCount >= config.bedrockHourlyCallLimit
  ) {
    throw new BedrockBudgetExceededError(
      "hourly_call_count",
      _counters.hourlyCallCount,
      config.bedrockHourlyCallLimit
    );
  }

  if (
    config.bedrockDailyCallLimit > 0 &&
    _counters.dailyCallCount >= config.bedrockDailyCallLimit
  ) {
    throw new BedrockBudgetExceededError(
      "daily_call_count",
      _counters.dailyCallCount,
      config.bedrockDailyCallLimit
    );
  }

  if (
    config.bedrockHourlyTokenLimit > 0 &&
    _counters.hourlyTokenCount >= config.bedrockHourlyTokenLimit
  ) {
    throw new BedrockBudgetExceededError(
      "hourly_token_count",
      _counters.hourlyTokenCount,
      config.bedrockHourlyTokenLimit
    );
  }

  if (
    config.bedrockDailyTokenLimit > 0 &&
    _counters.dailyTokenCount >= config.bedrockDailyTokenLimit
  ) {
    throw new BedrockBudgetExceededError(
      "daily_token_count",
      _counters.dailyTokenCount,
      config.bedrockDailyTokenLimit
    );
  }
}

/**
 * Record usage after a successful Bedrock call.
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
