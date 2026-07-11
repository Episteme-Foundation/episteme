import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const CONTRIBUTION_ID = "11111111-1111-1111-1111-111111111111";

const mocks = vi.hoisted(() => ({
  getContributionById: vi.fn(),
  getReviewForContribution: vi.fn(async () => ({ id: "rev-1" })),
  createAppeal: vi.fn(async () => ({
    id: "ap-1",
    contributionId: CONTRIBUTION_ID,
    originalReviewId: "rev-1",
    appellantId: "c-1",
    appealReasoning: "the flag is mistaken",
    submittedAt: new Date(),
    status: "pending",
  })),
  getAppealById: vi.fn(),
  getArbitrationForContribution: vi.fn(),
  getOrCreateContributor: vi.fn(),
  enqueueArbitration: vi.fn(async () => {}),
}));

vi.mock("../../../src/services/contribution-service.js", () => ({
  getContributionById: mocks.getContributionById,
  getReviewForContribution: mocks.getReviewForContribution,
  createAppeal: mocks.createAppeal,
  getAppealById: mocks.getAppealById,
  getArbitrationForContribution: mocks.getArbitrationForContribution,
}));
vi.mock("../../../src/services/contributor-service.js", () => ({
  getOrCreateContributor: mocks.getOrCreateContributor,
}));
vi.mock("../../../src/services/queue-service.js", () => ({
  enqueueArbitration: mocks.enqueueArbitration,
}));

import { appealRoutes } from "../../../src/routes/appeals.js";

async function buildApp() {
  const app = Fastify();
  app.decorateRequest("contributorExternalId", null);
  app.decorate("authenticate", async (request: any) => {
    request.contributorExternalId = "github:1";
  });
  await app.register(appealRoutes, { prefix: "/appeals" });
  return app;
}

const BODY = {
  contribution_id: CONTRIBUTION_ID,
  appeal_reasoning: "The bad-faith flag is a false positive; sources are real.",
};

beforeEach(() => {
  mocks.getContributionById.mockReset().mockResolvedValue({
    id: CONTRIBUTION_ID,
    contributorId: "c-1",
    reviewStatus: "rejected",
  });
  mocks.getOrCreateContributor.mockReset().mockResolvedValue({
    id: "c-1",
    isSuspended: false,
    suspensionReason: null,
  });
  mocks.createAppeal.mockClear();
  mocks.enqueueArbitration.mockClear();
});

describe("POST /appeals — suspension must not close the appeal path (#71)", () => {
  it("lets a suspended contributor appeal their OWN contribution", async () => {
    mocks.getOrCreateContributor.mockResolvedValue({
      id: "c-1",
      isSuspended: true,
      suspensionReason: "reputation: score fell below 10",
    });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/appeals", payload: BODY });
    expect(res.statusCode).toBe(201);
    expect(mocks.createAppeal).toHaveBeenCalled();
    expect(mocks.enqueueArbitration).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "appeal" })
    );
  });

  it("still blocks a suspended contributor from appealing someone else's", async () => {
    mocks.getOrCreateContributor.mockResolvedValue({
      id: "c-2",
      isSuspended: true,
      suspensionReason: "abuse",
    });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/appeals", payload: BODY });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CONTRIBUTOR_SUSPENDED");
  });

  it("unsuspended contributors can appeal others' rejections (unchanged)", async () => {
    mocks.getOrCreateContributor.mockResolvedValue({
      id: "c-2",
      isSuspended: false,
      suspensionReason: null,
    });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/appeals", payload: BODY });
    expect(res.statusCode).toBe(201);
  });
});
