import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the raw SQL the merge issues so we can assert the operation sequence
// without a live DB. mergeClaims uses rawQuery for every step.
const rawQuery = vi.fn(async () => [] as unknown[]);

vi.mock("../../../src/db/client.js", () => ({
  rawQuery: (...args: unknown[]) => rawQuery(...args),
  getDb: () => ({}),
}));

import { mergeClaims } from "../../../src/services/reconciliation-service.js";

function sqls(): string[] {
  return rawQuery.mock.calls.map((c) => String(c[0]));
}

describe("mergeClaims", () => {
  beforeEach(() => rawQuery.mockClear());

  it("moves instances, arguments, and edges onto the survivor, then marks the loser merged", async () => {
    await mergeClaims({
      survivorId: "s",
      loserId: "l",
      stanceRelation: "same",
      reasoning: "duplicate",
    });

    const all = sqls();
    expect(all.some((s) => /UPDATE claim_instances/.test(s))).toBe(true);
    expect(all.some((s) => /UPDATE arguments/.test(s))).toBe(true);
    // child-side and parent-side repoint (with a dedupe DELETE before each)
    expect(all.some((s) => /SET child_claim_id = \$1 WHERE child_claim_id = \$2/.test(s))).toBe(true);
    expect(all.some((s) => /SET parent_claim_id = \$1 WHERE parent_claim_id = \$2/.test(s))).toBe(true);
    // the loser becomes a merged alias pointing at the survivor
    expect(all.some((s) => /UPDATE claims SET merged_into = \$1, state = 'merged'/.test(s))).toBe(true);
  });

  it("flips moved stances (opposed=true) when merging a negation/counterpart", async () => {
    await mergeClaims({
      survivorId: "s",
      loserId: "l",
      stanceRelation: "opposed",
      reasoning: "negation",
    });

    const instancesCall = rawQuery.mock.calls.find((c) =>
      /UPDATE claim_instances/.test(String(c[0]))
    );
    expect(instancesCall?.[1]).toEqual(["s", "l", true]);

    const argumentsCall = rawQuery.mock.calls.find((c) =>
      /UPDATE arguments/.test(String(c[0]))
    );
    expect(argumentsCall?.[1]).toEqual(["s", "l", true]);
  });

  it("does NOT flip stances for a same-direction merge", async () => {
    await mergeClaims({
      survivorId: "s",
      loserId: "l",
      stanceRelation: "same",
      reasoning: "duplicate",
    });
    const instancesCall = rawQuery.mock.calls.find((c) =>
      /UPDATE claim_instances/.test(String(c[0]))
    );
    expect(instancesCall?.[1]).toEqual(["s", "l", false]);
  });

  it("refuses to merge a claim into itself", async () => {
    await expect(
      mergeClaims({ survivorId: "x", loserId: "x", stanceRelation: "same", reasoning: "" })
    ).rejects.toThrow();
  });
});
