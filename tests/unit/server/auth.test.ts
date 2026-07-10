import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";

// Builds a minimal app with the auth plugin and a route that echoes the
// contributor identity the plugin derived from the presented API key.
async function buildTestApp(apiKeysEnv: string | undefined) {
  if (apiKeysEnv === undefined) delete process.env.API_KEYS;
  else process.env.API_KEYS = apiKeysEnv;
  vi.resetModules();
  const { registerAuth } = await import("../../../src/server/plugins/auth.js");

  const app = Fastify();
  await registerAuth(app);
  app.get("/whoami", { preHandler: app.authenticate }, async (request) => ({
    contributor: request.contributorExternalId,
  }));
  return app;
}

describe("auth plugin contributor binding (issue #10)", () => {
  let savedApiKeys: string | undefined;

  beforeEach(() => {
    savedApiKeys = process.env.API_KEYS;
  });

  afterEach(() => {
    if (savedApiKeys === undefined) delete process.env.API_KEYS;
    else process.env.API_KEYS = savedApiKeys;
  });

  it("resolves the contributor bound to the presented key", async () => {
    const app = await buildTestApp("k1:alice,k2");
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-api-key": "k1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ contributor: "alice" });
  });

  it("leaves an unbound key with no contributor identity", async () => {
    const app = await buildTestApp("k1:alice,k2");
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-api-key": "k2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ contributor: null });
  });

  it("a caller cannot pick its own identity — only the key binding counts", async () => {
    const app = await buildTestApp("k1:alice,k2:bob");
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-api-key": "k2" },
    });
    expect(res.json()).toEqual({ contributor: "bob" });
  });

  it("rejects a missing or unknown key", async () => {
    const app = await buildTestApp("k1:alice");
    const missing = await app.inject({ method: "GET", url: "/whoami" });
    expect(missing.statusCode).toBe(401);
    const wrong = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-api-key": "nope" },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it("acts as dev-local when no keys are configured", async () => {
    const app = await buildTestApp(undefined);
    const res = await app.inject({ method: "GET", url: "/whoami" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ contributor: "dev-local" });
  });
});
