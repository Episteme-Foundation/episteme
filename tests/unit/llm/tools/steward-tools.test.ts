import { describe, it, expect, vi, beforeEach } from "vitest";

const NEW_CLAIM_ID = "11111111-1111-1111-1111-111111111111";

// Mock the DB so insert(...).values(...).returning() yields a deterministic id,
// and so the relationship insert (no .returning()) is awaitable.
vi.mock("../../../../src/db/client.js", () => {
  const values = () => {
    const p = Promise.resolve([{ id: NEW_CLAIM_ID }]);
    return Object.assign(p, { returning: () => Promise.resolve([{ id: NEW_CLAIM_ID }]) });
  };
  return {
    getDb: () => ({ insert: () => ({ values }) }),
    rawQuery: vi.fn(async () => []),
  };
});

vi.mock("../../../../src/services/embedding-service.js", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

vi.mock("../../../../src/services/queue-service.js", () => ({
  enqueueClaimPipeline: vi.fn(async () => {}),
  enqueueSteward: vi.fn(async () => {}),
}));

import { executeStewardTool } from "../../../../src/llm/tools/steward-tools.js";
import { enqueueClaimPipeline } from "../../../../src/services/queue-service.js";

describe("steward add_decomposition_edge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues the newly created subclaim for the claim pipeline (not orphaned)", async () => {
    const parentId = "22222222-2222-2222-2222-222222222222";
    const out = await executeStewardTool("add_decomposition_edge", {
      parent_id: parentId,
      child_text: "Subclaim added by the steward",
      relation: "requires",
      reasoning: "needed dependency",
    });

    expect(JSON.parse(out).success).toBe(true);

    // The regression this guards: the created claim must be enqueued so it gets
    // decomposed/assessed instead of sitting `pending` forever.
    expect(enqueueClaimPipeline).toHaveBeenCalledTimes(1);
    expect(enqueueClaimPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: NEW_CLAIM_ID,
        ancestorIds: [parentId], // seeded with parent for cycle safety
        currentDepth: 0,
      })
    );
  });
});
