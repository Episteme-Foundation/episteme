import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { MODELS, isAnthropicModelId, DEFAULT_MODEL } from "../../src/llm/models.js";

describe("model IDs", () => {
  it("DEFAULT_MODEL is the shared Sonnet ID", () => {
    expect(DEFAULT_MODEL).toBe(MODELS.sonnet);
  });

  it("accepts Anthropic API IDs", () => {
    expect(isAnthropicModelId("claude-sonnet-4-6")).toBe(true);
    expect(isAnthropicModelId("claude-haiku-4-5-20251001")).toBe(true);
  });

  it("rejects Bedrock-style IDs", () => {
    expect(isAnthropicModelId("us.anthropic.claude-sonnet-4-20250514")).toBe(false);
    expect(isAnthropicModelId("anthropic.claude-3-haiku")).toBe(false);
  });
});

describe("loadConfig model defaults", () => {
  const MODEL_ENV = ["GOVERNANCE_MODEL", "ARBITRATION_MODEL", "SECOND_OPINION_MODEL"];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of MODEL_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of MODEL_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to Anthropic API model IDs", async () => {
    const { loadConfig } = await import("../../src/config.js");
    const config = loadConfig();
    expect(config.governanceModel).toBe(MODELS.sonnet);
    expect(config.arbitrationModel).toBe(MODELS.sonnet);
    expect(config.secondOpinionModel).toBe(MODELS.haiku);
  });

  it("rejects a Bedrock-style override", async () => {
    process.env.GOVERNANCE_MODEL = "us.anthropic.claude-sonnet-4-20250514";
    const { loadConfig } = await import("../../src/config.js");
    expect(() => loadConfig()).toThrow();
  });
});
