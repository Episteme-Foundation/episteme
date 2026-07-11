import { describe, it, expect } from "vitest";
import {
  MODELS,
  isAnthropicModelId,
  modelAcceptsTemperature,
  modelNeedsRefusalFallback,
} from "../../../src/llm/models.js";

describe("model helpers", () => {
  it("recognizes Anthropic API ids and rejects Bedrock-prefixed ones", () => {
    expect(isAnthropicModelId("claude-sonnet-5")).toBe(true);
    expect(isAnthropicModelId("claude-fable-5")).toBe(true);
    expect(isAnthropicModelId("claude-opus-4-8")).toBe(true);
    expect(isAnthropicModelId("us.anthropic.claude-sonnet-5")).toBe(false);
  });

  it("allows temperature only for families known to accept it", () => {
    // Fable 5, Sonnet 5, and Opus 4.7+ reject non-default sampling params with
    // a 400 — and the client sends temperature: 0, which is non-default.
    expect(modelAcceptsTemperature(MODELS.fable)).toBe(false);
    expect(modelAcceptsTemperature(MODELS.sonnet)).toBe(false);
    expect(modelAcceptsTemperature(MODELS.opus)).toBe(false);
    expect(modelAcceptsTemperature("claude-opus-4-7")).toBe(false);
    // Haiku 4.x and Sonnet 4.x still accept it.
    expect(modelAcceptsTemperature(MODELS.haiku)).toBe(true);
    expect(modelAcceptsTemperature("claude-sonnet-4-6")).toBe(true);
  });

  it("opts only the Fable/Mythos family into the refusal fallback", () => {
    expect(modelNeedsRefusalFallback(MODELS.fable)).toBe(true);
    expect(modelNeedsRefusalFallback("claude-mythos-5")).toBe(true);
    expect(modelNeedsRefusalFallback(MODELS.opus)).toBe(false);
    expect(modelNeedsRefusalFallback(MODELS.sonnet)).toBe(false);
    expect(modelNeedsRefusalFallback(MODELS.haiku)).toBe(false);
  });
});
