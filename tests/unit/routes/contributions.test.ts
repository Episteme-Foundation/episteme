import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const CLAIM_ID = "11111111-1111-1111-1111-111111111111";

const mocks = vi.hoisted(() => ({
  getClaimById: vi.fn(async () => ({ id: "claim-1" })),
  getOrCreateContributor: vi.fn(),
  createContribution: vi.fn(async () => ({
    id: "co-1",
    claimId: "claim-1",
    contributorId: "c-1",
    contributionType: "challenge",
    content: "x",
    evidenceUrls: [],
    submittedAt: new Date(),
    reviewStatus: "pending",
    mergeTargetClaimId: null,
    proposedCanonicalForm: null,
  })),
  enqueueContribution: vi.fn(async () => {}),
  checkContributionRateLimit: vi.fn(() => ({
    limited: false,
    limitPerHour: 10,
    sandboxed: false,
  })),
}));

vi.mock("../../../src/services/claim-service.js", () => ({
  getClaimById: mocks.getClaimById,
}));
vi.mock("../../../src/services/contributor-service.js", () => ({
  getOrCreateContributor: mocks.getOrCreateContributor,
}));
vi.mock("../../../src/services/contribution-service.js", () => ({
  createContribution: mocks.createContribution,
  getContributionById: vi.fn(),
  listContributions: vi.fn(async () => []),
  getReviewForContribution: vi.fn(),
}));
vi.mock("../../../src/services/queue-service.js", () => ({
  enqueueContribution: mocks.enqueueContribution,
}));
vi.mock("../../../src/services/reputation-service.js", () => ({
  checkContributionRateLimit: mocks.checkContributionRateLimit,
}));

import { contributionRoutes } from "../../../src/routes/contributions.js";

function contributor(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    externalId: "github:1",
    displayName: "Ada",
    reputationScore: 50,
    contributionStanding: "good",
    badFaithFlags: 0,
    isSuspended: false,
    suspensionReason: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

async function buildApp(externalId: string | null = "github:1") {
  const app = Fastify();
  app.decorateRequest("contributorExternalId", null);
  app.decorate("authenticate", async (request: any) => {
    request.contributorExternalId = externalId;
  });
  await app.register(contributionRoutes, { prefix: "/contributions" });
  return app;
}

const BODY = {
  claim_id: CLAIM_ID,
  contribution_type: "challenge",
  content: "The cited statistic is misquoted.",
};

beforeEach(() => {
  mocks.getOrCreateContributor.mockReset().mockResolvedValue(contributor());
  mocks.createContribution.mockClear();
  mocks.enqueueContribution.mockClear();
  mocks.checkContributionRateLimit
    .mockReset()
    .mockReturnValue({ limited: false, limitPerHour: 10, sandboxed: false });
});

describe("POST /contributions gates (#71)", () => {
  it("accepts a contribution from a good-standing contributor", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/contributions",
      payload: BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(mocks.createContribution).toHaveBeenCalled();
    expect(mocks.enqueueContribution).toHaveBeenCalled();
  });

  it("requires a signed-in contributor identity (403)", async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: "POST",
      url: "/contributions",
      payload: BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("NO_CONTRIBUTOR_IDENTITY");
    expect(mocks.createContribution).not.toHaveBeenCalled();
  });

  it("blocks suspended contributors (403)", async () => {
    mocks.getOrCreateContributor.mockResolvedValue(
      contributor({ isSuspended: true, suspensionReason: "abuse" })
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/contributions",
      payload: BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CONTRIBUTOR_SUSPENDED");
  });

  it("returns 402 DEPOSIT_REQUIRED for must-pay standing (the payment seam)", async () => {
    mocks.getOrCreateContributor.mockResolvedValue(
      contributor({ contributionStanding: "must_pay", badFaithFlags: 1 })
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/contributions",
      payload: BODY,
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe("DEPOSIT_REQUIRED");
    expect(res.json().error.message).toContain("appeal");
    expect(mocks.createContribution).not.toHaveBeenCalled();
  });

  it("returns 429 when the sybil sandbox rate limit trips", async () => {
    mocks.checkContributionRateLimit.mockReturnValue({
      limited: true,
      limitPerHour: 3,
      sandboxed: true,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/contributions",
      payload: BODY,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("CONTRIBUTION_RATE_LIMITED");
    expect(mocks.createContribution).not.toHaveBeenCalled();
  });
});
