/**
 * The pure crypto half of the OAuth service: PKCE S256 verification and
 * token-shape helpers. The DB-backed flows are covered at the route level in
 * tests/unit/routes/oauth.test.ts.
 */
import crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/db/client.js", () => ({
  getDb: () => {
    throw new Error("pure helpers must not touch the DB");
  },
}));

import {
  hashToken,
  isOAuthAccessToken,
  verifyPkceS256,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
} from "../../../src/services/oauth-service.js";

describe("verifyPkceS256", () => {
  it("accepts a matching verifier/challenge pair", () => {
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier, "ascii")
      .digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    const challenge = crypto
      .createHash("sha256")
      .update("a".repeat(43), "ascii")
      .digest("base64url");
    expect(verifyPkceS256("b".repeat(43), challenge)).toBe(false);
  });

  it("rejects verifiers outside the RFC 7636 charset/length", () => {
    expect(verifyPkceS256("too-short", "x")).toBe(false);
    expect(verifyPkceS256("a".repeat(129), "x")).toBe(false);
    expect(verifyPkceS256("has spaces".padEnd(43, "a"), "x")).toBe(false);
  });
});

describe("token helpers", () => {
  it("recognizes access tokens by prefix", () => {
    expect(isOAuthAccessToken(`${ACCESS_TOKEN_PREFIX}abc`)).toBe(true);
    expect(isOAuthAccessToken(`${REFRESH_TOKEN_PREFIX}abc`)).toBe(false);
    expect(isOAuthAccessToken("epk_abc")).toBe(false);
  });

  it("hashes deterministically (SHA-256 hex)", () => {
    expect(hashToken("x")).toBe(hashToken("x"));
    expect(hashToken("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("x")).not.toBe(hashToken("y"));
  });
});
