/**
 * record_arbitration_decision applies intake contributions on overturn
 * (#157): an escalated proposal arbitrated in the contributor's favor must
 * materialize, exactly as a reviewer accept would — otherwise it would read
 * 'accepted' with nothing in the graph.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  reverseReviewOutcome: vi.fn(async () => null),
  materializeAcceptedIntake: vi.fn(),
  getContributionById: vi.fn(),
}));

vi.mock("../../../src/db/client.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: async (v: unknown) => {
        mocks.insertValues(v);
      },
    }),
    update: () => ({
      set: () => ({ where: async () => undefined }),
    }),
  }),
}));
vi.mock("../../../src/services/queue-service.js", () => ({
  enqueueSteward: vi.fn(),
}));
vi.mock("../../../src/services/reputation-service.js", () => ({
  reverseReviewOutcome: mocks.reverseReviewOutcome,
}));
vi.mock("../../../src/services/intake-service.js", () => ({
  materializeAcceptedIntake: mocks.materializeAcceptedIntake,
  isIntakeContributionType: (t: string) =>
    t === "propose_claim" || t === "propose_source",
}));
vi.mock("../../../src/services/contribution-service.js", () => ({
  getContributionById: mocks.getContributionById,
}));

import { executeArbitratorTool } from "../../../src/llm/tools/arbitrator-tools.js";

beforeEach(() => {
  mocks.insertValues.mockReset();
  mocks.reverseReviewOutcome.mockReset().mockResolvedValue(null);
  mocks.materializeAcceptedIntake.mockReset();
  mocks.getContributionById.mockReset();
});

describe("record_arbitration_decision on intake contributions", () => {
  it("materializes an overturned propose_claim and reports the result", async () => {
    mocks.getContributionById.mockResolvedValue({
      id: "contrib-1",
      contributionType: "propose_claim",
    });
    mocks.materializeAcceptedIntake.mockResolvedValue({
      action: "created_claim",
      claimId: "claim-1",
    });

    const result = JSON.parse(
      await executeArbitratorTool("record_arbitration_decision", {
        contribution_id: "contrib-1",
        outcome: "overturn",
        decision: "The rejection misapplied the claim bar.",
        reasoning: "Well-formed and in good faith.",
      })
    );

    expect(result.success).toBe(true);
    expect(result.materialization).toMatchObject({ action: "created_claim" });
    expect(mocks.materializeAcceptedIntake).toHaveBeenCalledWith("contrib-1");
  });

  it("does not materialize when the original decision is upheld", async () => {
    mocks.getContributionById.mockResolvedValue({
      id: "contrib-1",
      contributionType: "propose_claim",
    });

    const result = JSON.parse(
      await executeArbitratorTool("record_arbitration_decision", {
        contribution_id: "contrib-1",
        outcome: "uphold_original",
        decision: "The rejection stands.",
        reasoning: "Not a proposition.",
      })
    );

    expect(result.success).toBe(true);
    expect(mocks.materializeAcceptedIntake).not.toHaveBeenCalled();
  });

  it("leaves ordinary contribution overturns untouched by the intake path", async () => {
    mocks.getContributionById.mockResolvedValue({
      id: "contrib-1",
      contributionType: "challenge",
    });

    const result = JSON.parse(
      await executeArbitratorTool("record_arbitration_decision", {
        contribution_id: "contrib-1",
        outcome: "overturn",
        decision: "Rejection overturned.",
        reasoning: "The challenge was substantive.",
      })
    );

    expect(result.success).toBe(true);
    expect(mocks.materializeAcceptedIntake).not.toHaveBeenCalled();
    expect(mocks.reverseReviewOutcome).toHaveBeenCalled();
  });
});
