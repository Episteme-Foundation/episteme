import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/services/reconciliation-service.js", () => ({
  mergeClaims: vi.fn(async () => ({
    survivorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    loserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  })),
  createClaim: vi.fn(async () => ({ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" })),
  addRelationshipEdge: vi.fn(async () => ({ added: true })),
  removeRelationshipEdge: vi.fn(async () => ({ removed: 1 })),
  reassignInstance: vi.fn(async () => ({ reassigned: true })),
}));

vi.mock("../../../../src/services/queue-service.js", () => ({
  enqueueSteward: vi.fn(async () => {}),
}));

import { executeCuratorTool } from "../../../../src/llm/tools/curator-tools.js";
import { mergeClaims } from "../../../../src/services/reconciliation-service.js";

describe("curator merge_claims stance_relation (#182)", () => {
  const SURVIVOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const LOSER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a hedged/misspelled value WITHOUT merging (no silent 'same')", async () => {
    // The regression this guards: anything other than exactly "opposed" was
    // coerced to "same", so a value like "probably opposed" merged a claim
    // into its negation without flipping the moved stances.
    for (const bad of ["probably opposed", "Opposed", "opposite", "", undefined]) {
      const out = await executeCuratorTool("merge_claims", {
        survivor_id: SURVIVOR,
        loser_id: LOSER,
        stance_relation: bad,
        reasoning: "same proposition",
      });
      const parsed = JSON.parse(out);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain("stance_relation");
    }
    expect(mergeClaims).not.toHaveBeenCalled();
  });

  it("passes 'opposed' through exactly", async () => {
    const out = await executeCuratorTool("merge_claims", {
      survivor_id: SURVIVOR,
      loser_id: LOSER,
      stance_relation: "opposed",
      reasoning: "loser is the survivor's negation",
    });
    expect(JSON.parse(out).success).toBe(true);
    expect(mergeClaims).toHaveBeenCalledWith(
      expect.objectContaining({ stanceRelation: "opposed" })
    );
  });

  it("passes 'same' through exactly", async () => {
    const out = await executeCuratorTool("merge_claims", {
      survivor_id: SURVIVOR,
      loser_id: LOSER,
      stance_relation: "same",
      reasoning: "duplicate wording",
    });
    expect(JSON.parse(out).success).toBe(true);
    expect(mergeClaims).toHaveBeenCalledWith(
      expect.objectContaining({ stanceRelation: "same" })
    );
  });
});
