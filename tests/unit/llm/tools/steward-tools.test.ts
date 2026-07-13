import { describe, it, expect, vi, beforeEach } from "vitest";

const NEW_CLAIM_ID = "11111111-1111-1111-1111-111111111111";

const { insertedValues } = vi.hoisted(() => ({
  insertedValues: [] as Record<string, unknown>[],
}));

// Mock the DB so insert(...).values(...).returning() yields a deterministic id,
// and so the relationship insert (no .returning()) is awaitable. Capture every
// inserted row so tests can assert on the claim's steward_state (the #98 gate).
vi.mock("../../../../src/db/client.js", () => {
  const values = (row: Record<string, unknown>) => {
    insertedValues.push(row);
    const p = Promise.resolve([{ id: NEW_CLAIM_ID }]);
    return Object.assign(p, { returning: () => Promise.resolve([{ id: NEW_CLAIM_ID }]) });
  };
  // Minimal query-builder stubs so update_claim_assessment's select (prev
  // subclaim summary → []) and update (mark non-current → noop) chains resolve.
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
  const update = () => ({ set: () => ({ where: async () => undefined }) });
  return {
    getDb: () => ({ insert: () => ({ values }), select, update }),
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
  beforeEach(() => {
    vi.clearAllMocks();
    insertedValues.length = 0;
  });

  it("enqueues the newly created subclaim for the claim pipeline (not orphaned)", async () => {
    const parentId = "22222222-2222-2222-2222-222222222222";
    const out = await executeStewardTool("add_decomposition_edge", {
      parent_id: parentId,
      child_text: "Subclaim added by the steward",
      relation: "requires",
      reasoning: "needed dependency",
    });

    expect(JSON.parse(out).success).toBe(true);

    // Every minted claim is stamped with the current pipeline epoch, so cohorts
    // from before a prompt-era change stay identifiable (and archivable).
    const claimRow = insertedValues.find((r) => "text" in r);
    expect(claimRow?.pipelineEpoch).toBeTruthy();

    // The regression this guards: the created claim must be enqueued (onboarded)
    // so its Steward structures/assesses it instead of it sitting `pending`
    // forever. Recursion no longer threads depth/ancestors — the child's Steward
    // calls match_claim before creating anything, so it links existing ancestors
    // rather than looping into them.
    expect(enqueueClaimPipeline).toHaveBeenCalledTimes(1);
    expect(enqueueClaimPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: NEW_CLAIM_ID,
        jobId: "steward",
      })
    );
  });

  it("does NOT enqueue a low-importance subclaim — leaves it an embedded stub (#98)", async () => {
    // A subclaim the Steward judged uncontested/peripheral (below the default
    // 0.25 threshold) is created but not recursively decomposed — the economic
    // brake against over-decomposing settled bedrock.
    const out = await executeStewardTool("add_decomposition_edge", {
      parent_id: "22222222-2222-2222-2222-222222222222",
      child_text: "In a field of characteristic != 2, the element 2 is invertible",
      relation: "presupposes",
      reasoning: "settled algebra, uncontested",
      importance: 0.1,
    });

    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.child_claim_id).toBe(NEW_CLAIM_ID); // still created + embedded
    expect(enqueueClaimPipeline).not.toHaveBeenCalled(); // but not decomposed
    // Must be created 'deferred' — a claim left at the default 'pending' would be
    // picked up by the importance-ordered drain regardless of the missing enqueue.
    const claimRow = insertedValues.find((r) => "text" in r);
    expect(claimRow?.stewardState).toBe("deferred");
  });

  it("still enqueues a clearly important subclaim as a normal pending claim", async () => {
    await executeStewardTool("add_decomposition_edge", {
      parent_id: "22222222-2222-2222-2222-222222222222",
      child_text: "SARS-CoV-2 most likely had a zoonotic origin",
      relation: "supports",
      reasoning: "live contested crux",
      importance: 0.7,
    });
    expect(enqueueClaimPipeline).toHaveBeenCalledTimes(1);
    // Not gated → left at the default steward_state (drain picks it up).
    const claimRow = insertedValues.find((r) => "text" in r);
    expect(claimRow?.stewardState).toBeUndefined();
  });
});

describe("steward update_claim_assessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedValues.length = 0;
  });

  it("persists the reader-facing summary distinctly from the reasoning trace", async () => {
    await executeStewardTool("update_claim_assessment", {
      claim_id: "22222222-2222-2222-2222-222222222222",
      status: "contested",
      confidence: 0.6,
      summary: "The origin of SARS-CoV-2 remains genuinely disputed among experts.",
      reasoning_trace: "Instances split 1 affirm / 2 deny; market-origin and lab-leak both credible.",
    });
    const row = insertedValues.find((r) => "reasoningTrace" in r);
    expect(row?.summary).toBe("The origin of SARS-CoV-2 remains genuinely disputed among experts.");
    expect(row?.reasoningTrace).toBe("Instances split 1 affirm / 2 deny; market-origin and lab-leak both credible.");
  });

  it("falls back to the reasoning trace when summary is omitted (never writes blank)", async () => {
    await executeStewardTool("update_claim_assessment", {
      claim_id: "22222222-2222-2222-2222-222222222222",
      status: "verified",
      confidence: 0.9,
      reasoning_trace: "Traces to primary sources; no credible challenge.",
    });
    const row = insertedValues.find((r) => "reasoningTrace" in r);
    expect(row?.summary).toBe("Traces to primary sources; no credible challenge.");
  });
});
