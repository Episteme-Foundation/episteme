import { describe, it, expect } from "vitest";
import {
  generateApiKeyPlaintext,
  hashApiKey,
  API_KEY_PREFIX,
} from "../../../src/services/api-key-service.js";

describe("api-key material", () => {
  it("generates prefixed, high-entropy, unique keys", () => {
    const a = generateApiKeyPlaintext();
    const b = generateApiKeyPlaintext();
    expect(a).toMatch(/^epk_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(a.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it("hashes deterministically and never exposes the plaintext", () => {
    const key = generateApiKeyPlaintext();
    const h1 = hashApiKey(key);
    const h2 = hashApiKey(key);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(h1).not.toContain(key.slice(4, 20));
    expect(hashApiKey(key + "x")).not.toBe(h1);
  });
});
