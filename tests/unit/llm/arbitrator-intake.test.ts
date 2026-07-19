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
  applyArbitrationOutcome: vi.fn(async () => null),
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
  applyArbitrationOutcome: mocks.applyArbitrationOutcome,
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
  mocks.applyArbitrationOutcome.mockReset().mockResolvedValue(null);
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

// An escalated case was never decided, so there is nothing to reverse; the
// final outcome must be applied directly or the contributor earns nothing
// from an escalated-then-accepted contribution (#179).
describe("record_arbitration_decision reputation wiring", () => {
  beforeEach(() => {
    mocks.getContributionById.mockResolvedValue({
      id: "contrib-1",
      contributionType: "challenge",
    });
  });

  it("applies acceptance directly when an overturn finds nothing to reverse", async () => {
    mocks.reverseReviewOutcome.mockResolvedValue(null);
    mocks.applyArbitrationOutcome.mockResolvedValue({
      contributorId: "c-1",
      previousScore: 50,
      newScore: 52,
      standing: "good",
      suspended: false,
      kudosAwarded: 3,
    });

    const result = JSON.parse(
      await executeArbitratorTool("record_arbitration_decision", {
        contribution_id: "contrib-1",
        outcome: "overturn",
        decision: "The contribution should be accepted.",
        reasoning: "The escalated question resolves in the contributor's favor.",
      })
    );

    expect(mocks.applyArbitrationOutcome).toHaveBeenCalledWith({
      contributionId: "contrib-1",
      finalDecision: "accept",
    });
    expect(result.contributor_outcome_applied).toMatchObject({
      reputation: 52,
      kudos_awarded: 3,
    });
  });

  it("does not apply acceptance again when a reversal restored the contributor", async () => {
    mocks.reverseReviewOutcome.mockResolvedValue({
      contributorId: "c-1",
      previousScore: 34,
      newScore: 52,
      standingRestored: true,
      unsuspended: false,
      kudosAwarded: 5,
    });

    await executeArbitratorTool("record_arbitration_decision", {
      contribution_id: "contrib-1",
      outcome: "overturn",
      decision: "Rejection overturned.",
      reasoning: "The rejection misread the evidence.",
    });

    expect(mocks.applyArbitrationOutcome).not.toHaveBeenCalled();
  });

  it("applies the rejection outcome on uphold_original", async () => {
    await executeArbitratorTool("record_arbitration_decision", {
      contribution_id: "contrib-1",
      outcome: "uphold_original",
      decision: "The rejection stands.",
      reasoning: "The escalated question resolves against the contribution.",
    });

    expect(mocks.applyArbitrationOutcome).toHaveBeenCalledWith({
      contributionId: "contrib-1",
      finalDecision: "reject",
    });
    expect(mocks.reverseReviewOutcome).not.toHaveBeenCalled();
  });

  it("touches no reputation path on mark_contested", async () => {
    await executeArbitratorTool("record_arbitration_decision", {
      contribution_id: "contrib-1",
      outcome: "mark_contested",
      decision: "A real disagreement.",
      reasoning: "Both readings survive scrutiny.",
    });

    expect(mocks.applyArbitrationOutcome).not.toHaveBeenCalled();
    expect(mocks.reverseReviewOutcome).not.toHaveBeenCalled();
  });
});
