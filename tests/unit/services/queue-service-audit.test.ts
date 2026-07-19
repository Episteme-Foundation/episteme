/**
 * requestAudit (#180): the audit_runs row is created before the enqueue and
 * doubles as the dedupe gate — a lost INSERT conflict means no duplicate run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []),
}));

vi.mock("../../../src/db/client.js", () => ({
  rawQuery: mocks.rawQuery,
}));

import {
  requestAudit,
  getLocalQueue,
} from "../../../src/services/queue-service.js";

beforeEach(() => {
  mocks.rawQuery.mockReset();
  getLocalQueue("audit").length = 0;
});

describe("requestAudit", () => {
  it("creates the run row and enqueues the message carrying its id", async () => {
    mocks.rawQuery.mockResolvedValue([{ id: "run-1" }]);

    const runId = await requestAudit({
      auditType: "decision_audit",
      context: "A bad-faith flag was applied to contribution X.",
      triggeredBy: "bad_faith_flag",
      dedupeKey: "bad-faith:X",
    });

    expect(runId).toBe("run-1");
    const [sql, params] = mocks.rawQuery.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO audit_runs");
    expect(sql).toContain("ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING");
    expect(params).toEqual([
      "decision_audit",
      "A bad-faith flag was applied to contribution X.",
      "bad_faith_flag",
      "bad-faith:X",
    ]);

    expect(getLocalQueue("audit")).toEqual([
      {
        auditType: "decision_audit",
        context: "A bad-faith flag was applied to contribution X.",
        runId: "run-1",
      },
    ]);
  });

  it("a lost dedupe race enqueues nothing", async () => {
    mocks.rawQuery.mockResolvedValue([]);

    const runId = await requestAudit({
      auditType: "pattern_analysis",
      context: "Scheduled sweep.",
      triggeredBy: "scheduled_sweep",
      dedupeKey: "sweep:20661",
    });

    expect(runId).toBeNull();
    expect(getLocalQueue("audit")).toHaveLength(0);
  });
});
