import { describe, it, expect } from "vitest";

import { formatAssessment } from "../../../src/routes/claims.js";

describe("formatAssessment", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    status: "supported",
    confidence: 0.8,
    reasoningTrace: "because",
    subclaimSummary: { a: 1 } as unknown,
    assessedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("serializes a fully-populated assessment with snake_case fields", () => {
    expect(formatAssessment(base)).toEqual({
      id: base.id,
      status: "supported",
      confidence: 0.8,
      reasoning_trace: "because",
      subclaim_summary: { a: 1 },
      assessed_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("never emits a null subclaim_summary (issue #17)", () => {
    const result = formatAssessment({ ...base, subclaimSummary: null });
    expect(result.subclaim_summary).toEqual({});
    // clients rely on this being safe to Object.entries()
    expect(() => Object.entries(result.subclaim_summary as object)).not.toThrow();
  });
});
