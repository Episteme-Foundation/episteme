import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture requests at the SDK boundary so we can assert on exactly what the
// client sends (params, endpoint) per model family.
const createMock = vi.fn();
const betaCreateMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: createMock };
    beta = { messages: { create: betaCreateMock } };
  },
}));

vi.mock("../../../src/config.js", () => ({
  loadConfig: () => ({ anthropicApiKey: "test-key" }),
}));

vi.mock("../../../src/llm/budget-tracker.js", () => ({
  checkBudget: vi.fn(),
  recordUsage: vi.fn(),
}));

import { complete } from "../../../src/llm/client.js";
import { LlmRefusalError } from "../../../src/llm/errors.js";
import { MODELS } from "../../../src/llm/models.js";

const okResponse = {
  content: [{ type: "text", text: "hello" }],
  usage: { input_tokens: 10, output_tokens: 5 },
  stop_reason: "end_turn",
  container: null,
};

const messages = [{ role: "user" as const, content: "hi" }];

beforeEach(() => {
  createMock.mockReset().mockResolvedValue(okResponse);
  betaCreateMock.mockReset().mockResolvedValue(okResponse);
});

describe("complete() model routing", () => {
  it("routes Fable through the beta endpoint with the Opus refusal fallback", async () => {
    const result = await complete({ messages, model: MODELS.fable });

    expect(result.content).toBe("hello");
    expect(createMock).not.toHaveBeenCalled();
    const params = betaCreateMock.mock.calls[0]![0];
    expect(params.model).toBe(MODELS.fable);
    expect(params.betas).toEqual(["server-side-fallback-2026-06-01"]);
    expect(params.fallbacks).toEqual([{ model: MODELS.opus }]);
    // Fable rejects sampling params and any thinking config with a 400.
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("thinking");
  });

  it("omits temperature for Sonnet 5 (non-default values 400)", async () => {
    await complete({ messages, model: MODELS.sonnet, temperature: 0 });

    expect(betaCreateMock).not.toHaveBeenCalled();
    const params = createMock.mock.calls[0]![0];
    expect(params.model).toBe(MODELS.sonnet);
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("fallbacks");
  });

  it("still sends temperature for Haiku", async () => {
    await complete({ messages, model: MODELS.haiku });

    const params = createMock.mock.calls[0]![0];
    expect(params.temperature).toBe(0);
  });
});

describe("complete() refusal handling", () => {
  it("throws LlmRefusalError instead of returning empty content", async () => {
    createMock.mockResolvedValue({
      ...okResponse,
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber" },
    });

    await expect(complete({ messages, model: MODELS.sonnet })).rejects.toThrow(
      LlmRefusalError
    );
  });

  it("throws when the whole Fable fallback chain refused", async () => {
    betaCreateMock.mockResolvedValue({
      ...okResponse,
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: null },
    });

    await expect(complete({ messages, model: MODELS.fable })).rejects.toThrow(
      LlmRefusalError
    );
  });
});
