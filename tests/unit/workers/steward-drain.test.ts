import { describe, it, expect, beforeEach, vi } from "vitest";

// The Steward queue is the `claims` table (steward_state='pending'), drained
// highest-importance-first by SQL `ORDER BY importance DESC`. That ordering is
// the DB's job and is verified live in the corpus harness (CI has no Postgres).
// Here we test the drain's CONTROL FLOW — task claiming, the maxTasks cap, the
// empty/budget transitions, and that a budget error returns the claim to the
// queue — by mocking the DB layer and the Steward agent.

const { runCalls, state } = vi.hoisted(() => ({
  runCalls: [] as string[],
  state: {
    pending: [] as string[],
    budgetThrows: false,
    markedPendingAgain: [] as string[],
  },
}));

vi.mock("../../../src/db/client.js", () => ({
  rawQuery: vi.fn(async (q: string, params: unknown[] = []) => {
    if (q.includes("steward_state = 'running'")) {
      const id = state.pending.shift();
      return id
        ? [{ id, steward_trigger: "structure_and_assess", steward_context: "" }]
        : [];
    }
    if (q.includes("count(")) return [{ n: state.pending.length }];
    // A budget revert: UPDATE ... SET steward_state = 'pending' WHERE id = $1
    if (q.includes("steward_state = 'pending'") && q.startsWith("UPDATE")) {
      state.markedPendingAgain.push(params[0] as string);
    }
    return [];
  }),
}));

vi.mock("../../../src/llm/agents/claim-steward.js", () => ({
  runClaimSteward: vi.fn(async (input: { claimId: string }) => {
    runCalls.push(input.claimId);
    if (state.budgetThrows) {
      const { LlmBudgetExceededError } = await import("../../../src/llm/errors.js");
      throw new LlmBudgetExceededError("daily_token_count", 1, 1);
    }
  }),
}));

vi.mock("../../../src/llm/budget-tracker.js", () => ({ checkBudget: vi.fn() }));
vi.mock("../../../src/config.js", () => ({
  loadConfig: () => ({ stewardModel: "claude-sonnet-4-6", stewardMaxRuns: 0 }),
}));

import {
  drainStewardQueue,
  processNextStewardTask,
} from "../../../src/workers/steward-pipeline.js";

describe("Steward DB-backed drain", () => {
  beforeEach(() => {
    runCalls.length = 0;
    state.pending = [];
    state.budgetThrows = false;
    state.markedPendingAgain = [];
  });

  it("drains every pending claim, then reports empty", async () => {
    state.pending = ["a", "b", "c"];
    const res = await drainStewardQueue();
    expect(runCalls).toEqual(["a", "b", "c"]);
    expect(res).toEqual({ processed: 3, budgetHit: false });
  });

  it("stops at maxTasks, leaving the rest pending (stubs)", async () => {
    state.pending = ["a", "b", "c", "d"];
    const res = await drainStewardQueue({ maxTasks: 2 });
    expect(runCalls).toEqual(["a", "b"]);
    expect(res.processed).toBe(2);
    expect(state.pending).toEqual(["c", "d"]); // untouched
  });

  it("returns 'empty' when nothing is pending", async () => {
    const r = await processNextStewardTask();
    expect(r.status).toBe("empty");
    expect(runCalls).toEqual([]);
  });

  it("on a budget error, returns the claim to the queue and reports budget", async () => {
    state.pending = ["a", "b"];
    state.budgetThrows = true;
    const r = await processNextStewardTask();
    expect(r.status).toBe("budget");
    expect(runCalls).toEqual(["a"]);
    expect(state.markedPendingAgain).toContain("a"); // re-queued, not lost
  });
});
