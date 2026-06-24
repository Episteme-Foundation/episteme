import { describe, it, expect } from "vitest";
import {
  MODELS,
  isAnthropicModelId,
  modelAcceptsTemperature,
} from "../../../src/llm/models.js";

describe("model helpers", () => {
  it("recognizes Anthropic API ids and rejects Bedrock-prefixed ones", () => {
    expect(isAnthropicModelId("claude-sonnet-4-6")).toBe(true);
    expect(isAnthropicModelId("claude-opus-4-8")).toBe(true);
    expect(isAnthropicModelId("us.anthropic.claude-sonnet-4-6")).toBe(false);
  });

  it("omits temperature only for Opus 4.8 (which deprecated it)", () => {
    // Opus 4.8 returns 400 "temperature is deprecated for this model." if sent.
    expect(modelAcceptsTemperature(MODELS.opus)).toBe(false);
    expect(modelAcceptsTemperature("claude-opus-4-8")).toBe(false);
    // Sonnet / Haiku still accept it.
    expect(modelAcceptsTemperature(MODELS.sonnet)).toBe(true);
    expect(modelAcceptsTemperature(MODELS.haiku)).toBe(true);
  });
});
