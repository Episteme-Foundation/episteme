import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { RequestAuth } from "../../../src/server/plugins/auth.js";

const mocks = vi.hoisted(() => ({
  analyzePage: vi.fn(),
  chatAboutPage: vi.fn(),
  usageContexts: [] as unknown[],
}));

vi.mock("../../../src/services/extension-service.js", () => ({
  analyzePage: mocks.analyzePage,
  chatAboutPage: mocks.chatAboutPage,
}));

// Capture the ambient usage context the route establishes for metering (#70).
vi.mock("../../../src/llm/usage-context.js", () => ({
  runWithUsageContext: (ctx: unknown, fn: () => unknown) => {
    mocks.usageContexts.push(ctx);
    return fn();
  },
}));

const userAuth: RequestAuth = {
  method: "api_key",
  userId: "user-1",
  apiKeyId: "key-1",
  contributorExternalId: "github:1",
  isService: false,
  isSession: false,
};

async function buildTestApp() {
  const { extensionRoutes } = await import("../../../src/routes/extension.js");
  const app = Fastify();
  app.decorateRequest("auth", null);
  const gates = { authenticate: 0, quota: 0 };
  app.decorate("authenticate", async (request: any) => {
    gates.authenticate++;
    request.auth = userAuth;
  });
  app.decorate("requireAgenticQuota", async () => {
    gates.quota++;
  });
  await app.register(extensionRoutes, { prefix: "/extension" });
  return { app, gates };
}

const ANALYSIS = {
  url: "https://example.com/a",
  content_hash: "abc",
  annotations: [],
  stats: { extracted: 0, matched: 0 },
  analyzed_at: "2026-07-10T00:00:00.000Z",
};

describe("extension routes", () => {
  beforeEach(() => {
    mocks.analyzePage.mockReset();
    mocks.chatAboutPage.mockReset();
    mocks.usageContexts.length = 0;
  });

  it("POST /extension/analyze runs both auth gates and meters as the caller", async () => {
    mocks.analyzePage.mockResolvedValue({ analysis: ANALYSIS, cached: false });
    const { app, gates } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/extension/analyze",
      payload: {
        url: "https://example.com/a",
        title: "A",
        content: "x".repeat(200),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ...ANALYSIS, cached: false });
    expect(gates.authenticate).toBe(1);
    expect(gates.quota).toBe(1);
    expect(mocks.usageContexts[0]).toMatchObject({
      userId: "user-1",
      apiKeyId: "key-1",
    });
  });

  it("POST /extension/chat forwards history + page context and returns citations", async () => {
    mocks.chatAboutPage.mockResolvedValue({
      reply: "Grounded answer [claim:11111111-2222-3333-4444-555555555555]",
      citations: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          canonical_form: "C",
          status: "verified",
          url: "https://episteme.wiki/claims/11111111-2222-3333-4444-555555555555",
        },
      ],
    });
    const { app, gates } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/extension/chat",
      payload: {
        messages: [{ role: "user", content: "is this true?" }],
        page: { url: "https://example.com/a", title: "A", claims: [] },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().citations).toHaveLength(1);
    expect(gates.quota).toBe(1);
    expect(mocks.chatAboutPage).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "is this true?" }],
      })
    );
  });

  it("rejects a chat whose last message is not from the user", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/extension/chat",
      payload: {
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(mocks.chatAboutPage).not.toHaveBeenCalled();
  });

  it("rejects content that is too short to analyze", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/extension/analyze",
      payload: { url: "https://example.com/a", content: "too short" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(mocks.analyzePage).not.toHaveBeenCalled();
  });
});
