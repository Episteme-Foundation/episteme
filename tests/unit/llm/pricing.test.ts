import { describe, it, expect } from "vitest";
import {
  costMicroUsd,
  ratesForModel,
  formatMicroUsd,
} from "../../../src/llm/pricing.js";

describe("pricing", () => {
  it("resolves model families by prefix, including dated snapshots", () => {
    expect(ratesForModel("claude-opus-4-8")).toEqual({
      inputPerMtok: 5,
      outputPerMtok: 25,
    });
    expect(ratesForModel("claude-haiku-4-5-20251001")).toEqual({
      inputPerMtok: 1,
      outputPerMtok: 5,
    });
  });

  it("prices unknown models at the conservative fallback, never free", () => {
    const rates = ratesForModel("claude-hypothetical-9");
    expect(rates.inputPerMtok).toBeGreaterThan(0);
    expect(rates.outputPerMtok).toBeGreaterThan(0);
  });

  it("derives cost from all four token components", () => {
    // Sonnet 4.6: $3 in / $15 out per MTok; cache read 0.1×, write 1.25×.
    const micro = costMicroUsd("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });
    // 3 + 15 + 0.3 + 3.75 = 22.05 USD
    expect(micro).toBe(22_050_000);
  });

  it("rounds to integer micro-USD for small calls", () => {
    const micro = costMicroUsd("claude-haiku-4-5-20251001", {
      inputTokens: 137,
      outputTokens: 42,
    });
    // 137/1e6*1 + 42/1e6*5 = 0.000347 USD = 347 μUSD
    expect(micro).toBe(347);
  });

  it("formats micro-USD for display", () => {
    expect(formatMicroUsd(22_050_000)).toBe("$22.0500");
    expect(formatMicroUsd(347)).toBe("$0.0003");
  });
});
