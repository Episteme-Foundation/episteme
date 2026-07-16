/**
 * Phase 0 of issue #157: the two surfaces that mint live claims from caller
 * content — POST /claims/propose and POST /sources — are restricted to direct
 * service callers (internal seeding) until intake goes through the review
 * pipeline. These tests pin the guard to the routes; the guard's own
 * semantics (who counts as a direct service caller) are covered in
 * tests/unit/server/auth.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { RequestAuth } from "../../../src/server/plugins/auth.js";

const mocks = vi.hoisted(() => ({
  proposeClaim: vi.fn(),
  submitSource: vi.fn(),
}));

// The claims route module pulls in the whole read stack; stub every service
// import so registering the routes needs no database.
vi.mock("../../../src/services/claim-service.js", () => ({
  getClaimById: vi.fn(),
  listClaims: vi.fn(),
  proposeClaim: mocks.proposeClaim,
}));
vi.mock("../../../src/services/assessment-service.js", () => ({
  getAssessmentHistory: vi.fn(),
  getAssessmentTrajectory: vi.fn(),
}));
vi.mock("../../../src/services/search-service.js", () => ({
  hybridSearch: vi.fn(),
}));
vi.mock("../../../src/services/tree-service.js", () => ({
  getClaimTree: vi.fn(),
  getSubclaimCount: vi.fn(),
  getClaimDependents: vi.fn(),
  listClaimDependents: vi.fn(),
}));
vi.mock("../../../src/services/argument-service.js", () => ({
  addArgument: vi.fn(),
  getArgumentsForClaim: vi.fn(),
}));
vi.mock("../../../src/services/source-service.js", () => ({
  submitSource: mocks.submitSource,
}));
vi.mock("../../../src/db/client.js", () => ({ getDb: vi.fn() }));

const serviceAuth: RequestAuth = {
  method: "env_key",
  userId: null,
  apiKeyId: null,
  contributorExternalId: "ops",
  isService: true,
  isSession: false,
};

const userAuth: RequestAuth = {
  method: "api_key",
  userId: "user-1",
  apiKeyId: "key-1",
  contributorExternalId: "github:1",
  isService: false,
  isSession: false,
};

async function buildTestApp(auth: RequestAuth) {
  const { claimRoutes } = await import("../../../src/routes/claims.js");
  const { sourceRoutes } = await import("../../../src/routes/sources.js");
  const { registerAuth } = await import(
    "../../../src/server/plugins/auth.js"
  );

  const app = Fastify();
  // Real guard decorators, stubbed identity resolution: overwrite
  // app.authenticate after registerAuth so requireDirectService runs exactly
  // as in production against a fixed RequestAuth.
  await registerAuth(app);
  app.authenticate = async (request) => {
    request.auth = auth;
  };
  app.decorate("requireAgenticQuota", async () => {});
  await app.register(claimRoutes, { prefix: "/claims" });
  await app.register(sourceRoutes, { prefix: "/sources" });
  return app;
}

describe("write-surface lockdown (#157 phase 0)", () => {
  beforeEach(() => {
    mocks.proposeClaim.mockReset();
    mocks.submitSource.mockReset();
  });

  it("POST /claims/propose rejects user-scope callers with 403 and writes nothing", async () => {
    const app = await buildTestApp(userAuth);
    const res = await app.inject({
      method: "POST",
      url: "/claims/propose",
      payload: { claim: "The sky is blue", argument: "Look up." },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("DIRECT_SERVICE_REQUIRED");
    expect(mocks.proposeClaim).not.toHaveBeenCalled();
  });

  it("POST /claims/propose still serves direct service callers", async () => {
    mocks.proposeClaim.mockResolvedValue({
      claim: {
        id: "11111111-1111-1111-1111-111111111111",
        text: "The sky is blue",
        claimType: "empirical_direct",
        state: "active",
        decompositionStatus: "pending",
        importance: 0.5,
        stewardState: "pending",
        createdBy: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      argument: {
        id: "22222222-2222-2222-2222-222222222222",
        stance: "for",
        content: "Look up.",
        createdBy: "user",
        createdAt: new Date(),
      },
      jobId: "33333333-3333-3333-3333-333333333333",
    });
    const app = await buildTestApp(serviceAuth);
    const res = await app.inject({
      method: "POST",
      url: "/claims/propose",
      payload: { claim: "The sky is blue", argument: "Look up." },
    });
    expect(res.statusCode).toBe(201);
    expect(mocks.proposeClaim).toHaveBeenCalledOnce();
  });

  it("POST /sources rejects user-scope callers with 403 and enqueues nothing", async () => {
    const app = await buildTestApp(userAuth);
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      payload: { url: "https://example.com/article" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("DIRECT_SERVICE_REQUIRED");
    expect(mocks.submitSource).not.toHaveBeenCalled();
  });

  it("POST /sources still serves direct service callers", async () => {
    mocks.submitSource.mockResolvedValue({
      sourceId: "44444444-4444-4444-4444-444444444444",
      jobId: "55555555-5555-5555-5555-555555555555",
    });
    const app = await buildTestApp(serviceAuth);
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      payload: { url: "https://example.com/article" },
    });
    expect(res.statusCode).toBe(202);
    expect(mocks.submitSource).toHaveBeenCalledOnce();
  });

  it("POST /sources rejects a service session acting for a user (web BFF path)", async () => {
    const app = await buildTestApp({
      ...serviceAuth,
      userId: "user-9",
      contributorExternalId: "github:9",
      isSession: true,
    });
    const res = await app.inject({
      method: "POST",
      url: "/sources",
      payload: { url: "https://example.com/article" },
    });
    expect(res.statusCode).toBe(403);
    expect(mocks.submitSource).not.toHaveBeenCalled();
  });
});
