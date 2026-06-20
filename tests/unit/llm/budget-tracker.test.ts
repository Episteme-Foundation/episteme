import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config.js", () => {
  let _limits = {
    llmHourlyCallLimit: 10,
    llmDailyCallLimit: 100,
    llmHourlyTokenLimit: 50000,
    llmDailyTokenLimit: 500000,
  };
  return {
    loadConfig: vi.fn(() => _limits),
    __setLimits: (limits: typeof _limits) => {
      _limits = limits;
    },
  };
});

import {
  checkBudget,
  recordUsage,
  resetBudgetCounters,
  getBudgetStatus,
} from "../../../src/llm/budget-tracker.js";
import { LlmBudgetExceededError } from "../../../src/llm/errors.js";

describe("BudgetTracker", () => {
  beforeEach(() => {
    resetBudgetCounters();
  });

  it("allows calls within hourly call limit", () => {
    for (let i = 0; i < 9; i++) {
      checkBudget();
      recordUsage(100, 200);
    }
    expect(getBudgetStatus().hourlyCallCount).toBe(9);
    expect(() => checkBudget()).not.toThrow();
  });

  it("throws when hourly call limit is reached", () => {
    for (let i = 0; i < 10; i++) {
      checkBudget();
      recordUsage(100, 200);
    }
    expect(() => checkBudget()).toThrow(LlmBudgetExceededError);
  });

  it("throws with correct metadata", () => {
    for (let i = 0; i < 10; i++) {
      checkBudget();
      recordUsage(100, 200);
    }
    try {
      checkBudget();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LlmBudgetExceededError);
      const e = err as LlmBudgetExceededError;
      expect(e.limitType).toBe("hourly_call_count");
      expect(e.currentValue).toBe(10);
      expect(e.limitValue).toBe(10);
    }
  });

  it("throws when hourly token limit is reached", () => {
    checkBudget();
    recordUsage(25000, 25000);
    expect(() => checkBudget()).toThrow(LlmBudgetExceededError);
  });

  it("tracks daily limits separately from hourly", () => {
    const status = getBudgetStatus();
    expect(status.dailyCallCount).toBe(0);
    expect(status.hourlyCallCount).toBe(0);

    checkBudget();
    recordUsage(100, 200);

    const updated = getBudgetStatus();
    expect(updated.dailyCallCount).toBe(1);
    expect(updated.hourlyCallCount).toBe(1);
    expect(updated.dailyTokenCount).toBe(300);
    expect(updated.hourlyTokenCount).toBe(300);
  });

  it("allows unlimited when limit is 0", async () => {
    const { __setLimits } = await import("../../../src/config.js") as {
      __setLimits: (limits: Record<string, number>) => void;
    };
    __setLimits({
      llmHourlyCallLimit: 0,
      llmDailyCallLimit: 0,
      llmHourlyTokenLimit: 0,
      llmDailyTokenLimit: 0,
    });

    for (let i = 0; i < 1000; i++) {
      checkBudget();
      recordUsage(10000, 10000);
    }
    // Should never throw

    // Restore
    __setLimits({
      llmHourlyCallLimit: 10,
      llmDailyCallLimit: 100,
      llmHourlyTokenLimit: 50000,
      llmDailyTokenLimit: 500000,
    });
  });

  it("resets hourly counters on hour boundary", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 10; i++) {
      checkBudget();
      recordUsage(100, 200);
    }
    expect(() => checkBudget()).toThrow(LlmBudgetExceededError);

    // Advance past hour boundary
    vi.advanceTimersByTime(3_600_001);
    expect(() => checkBudget()).not.toThrow();

    // Daily counter should still be at 10
    const status = getBudgetStatus();
    expect(status.hourlyCallCount).toBe(0);
    expect(status.dailyCallCount).toBe(10);

    vi.useRealTimers();
  });

  it("resets daily counters on day boundary", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 10; i++) {
      checkBudget();
      recordUsage(100, 200);
    }

    // Advance past day boundary
    vi.advanceTimersByTime(86_400_001);
    const status = getBudgetStatus();
    expect(status.hourlyCallCount).toBe(0);
    expect(status.dailyCallCount).toBe(0);

    vi.useRealTimers();
  });
});
