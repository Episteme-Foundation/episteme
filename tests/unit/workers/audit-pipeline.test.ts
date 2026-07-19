/**
 * Audit pipeline (#180): the worker passes the run identity through to the
 * agent and closes out the audit_runs row afterward.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []),
  runAudit: vi.fn(async () => {}),
}));

vi.mock("../../../src/db/client.js", () => ({
  rawQuery: mocks.rawQuery,
}));
vi.mock("../../../src/llm/agents/audit-agent.js", () => ({
  runAudit: mocks.runAudit,
}));

import { handleAuditMessage } from "../../../src/workers/audit-pipeline.js";

beforeEach(() => {
  mocks.rawQuery.mockReset();
  mocks.runAudit.mockClear();
});

describe("handleAuditMessage", () => {
  it("runs the agent with the run id and marks the run completed", async () => {
    await handleAuditMessage({
      auditType: "decision_audit",
      context: "ctx",
      runId: "run-1",
    });

    expect(mocks.runAudit).toHaveBeenCalledWith({
      auditType: "decision_audit",
      context: "ctx",
      runId: "run-1",
    });
    const update = mocks.rawQuery.mock.calls.find(([sql]) =>
      (sql as string).includes("UPDATE audit_runs")
    );
    expect(update).toBeDefined();
    expect(update![1]).toEqual(["run-1"]);
  });

  it("tolerates messages without a run id", async () => {
    await handleAuditMessage({ auditType: "pattern_analysis", context: "ctx" });
    expect(mocks.runAudit).toHaveBeenCalled();
    expect(mocks.rawQuery).not.toHaveBeenCalled();
  });
});
