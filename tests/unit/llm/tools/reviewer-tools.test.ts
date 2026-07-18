import { describe, it, expect, vi, beforeEach } from "vitest";

const REVIEW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTRIBUTION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const mocks = vi.hoisted(() => ({
  insertedReviews: [] as Array<Record<string, unknown>>,
  updateSets: [] as Array<Record<string, unknown>>,
  applyReviewOutcome: vi.fn(async () => ({
    contributorId: "c-1",
    previousScore: 50,
    newScore: 49,
    standing: "good",
    suspended: false,
    kudosAwarded: 0,
  })),
}));

vi.mock("../../../../src/db/client.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        mocks.insertedReviews.push(v);
        return {
          returning: async () => [{ id: REVIEW_ID, ...v }],
        };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        mocks.updateSets.push(v);
        return { where: async () => undefined };
      },
    }),
  }),
  rawQuery: vi.fn(async () => []),
}));

vi.mock("../../../../src/services/queue-service.js", () => ({
  enqueueArbitration: vi.fn(async () => {}),
  enqueueSteward: vi.fn(async () => {}),
}));

vi.mock("../../../../src/services/reputation-service.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../../../src/services/reputation-service.js")
  >();
  return { ...original, applyReviewOutcome: mocks.applyReviewOutcome };
});

// An accept now checks whether the contribution is an intake type (#157);
// these are ordinary contributions, so the intake path stays cold (covered in
// tests/unit/llm/reviewer-intake.test.ts).
vi.mock("../../../../src/services/contribution-service.js", () => ({
  getContributionById: vi.fn(async () => ({
    id: CONTRIBUTION_ID,
    contributionType: "challenge",
  })),
}));
vi.mock("../../../../src/services/intake-service.js", () => ({
  isIntakeContributionType: (t: string) =>
    t === "propose_claim" || t === "propose_source",
  materializeAcceptedIntake: vi.fn(),
}));

import { executeReviewerTool } from "../../../../src/llm/tools/reviewer-tools.js";

beforeEach(() => {
  mocks.insertedReviews.length = 0;
  mocks.updateSets.length = 0;
  mocks.applyReviewOutcome.mockClear();
});

describe("record_review_decision", () => {
  it("persists a bad-faith rejection and routes consequences through the reputation service", async () => {
    const out = JSON.parse(
      await executeReviewerTool("record_review_decision", {
        contribution_id: CONTRIBUTION_ID,
        decision: "reject",
        reasoning: "fabricated sources",
        confidence: 0.95,
        policy_citations: ["VERIFIABILITY", "GF"],
        suspected_bad_faith: true,
        bad_faith_category: "misinformation",
      })
    );

    expect(out.success).toBe(true);
    expect(mocks.insertedReviews[0]).toMatchObject({
      suspectedBadFaith: true,
      badFaithCategory: "misinformation",
      decision: "reject",
    });
    expect(mocks.applyReviewOutcome).toHaveBeenCalledWith({
      contributionId: CONTRIBUTION_ID,
      reviewId: REVIEW_ID,
      decision: "reject",
      suspectedBadFaith: true,
      badFaithCategory: "misinformation",
    });
    expect(out.contributor).toMatchObject({ reputation: 49, standing: "good" });
  });

  it("ignores a bad-faith flag on a non-reject decision", async () => {
    const out = JSON.parse(
      await executeReviewerTool("record_review_decision", {
        contribution_id: CONTRIBUTION_ID,
        decision: "accept",
        reasoning: "solid evidence",
        confidence: 0.9,
        policy_citations: ["VERIFIABILITY"],
        suspected_bad_faith: true,
      })
    );

    expect(out.success).toBe(true);
    expect(out.note).toContain("ignored");
    expect(mocks.insertedReviews[0]).toMatchObject({
      suspectedBadFaith: false,
      badFaithCategory: null,
    });
    expect(mocks.applyReviewOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ suspectedBadFaith: false })
    );
  });

  it("records a plain sincere rejection without any flag", async () => {
    await executeReviewerTool("record_review_decision", {
      contribution_id: CONTRIBUTION_ID,
      decision: "reject",
      reasoning: "insufficient sourcing",
      confidence: 0.8,
      policy_citations: ["SOURCE_HIERARCHY"],
    });

    expect(mocks.insertedReviews[0]).toMatchObject({
      suspectedBadFaith: false,
      badFaithCategory: null,
    });
  });
});

describe("escalate_to_arbitrator", () => {
  // The escalation reason must survive the call (#178): without it, an
  // escalation recorded without a review row reaches the Arbitrator with no
  // reasoning at all.
  it("persists the escalation reason on the contribution", async () => {
    const out = JSON.parse(
      await executeReviewerTool("escalate_to_arbitrator", {
        contribution_id: CONTRIBUTION_ID,
        reason: "credible sources conflict; needs deeper adjudication",
      })
    );

    expect(out.success).toBe(true);
    expect(mocks.updateSets).toContainEqual({
      reviewStatus: "escalated",
      escalationReason: "credible sources conflict; needs deeper adjudication",
    });
  });
});
