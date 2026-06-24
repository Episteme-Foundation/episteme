import { describe, it, expect, beforeEach, vi } from "vitest";

// Record the order the steward handler is invoked in, without hitting the LLM/DB.
const { processed } = vi.hoisted(() => ({ processed: [] as string[] }));

vi.mock("../../../src/workers/steward-pipeline.js", () => ({
  handleStewardMessage: async (m: { claimId: string }) => {
    processed.push(m.claimId);
  },
}));

import { drainLocalQueues } from "../../../src/workers/local-runner.js";
import { enqueueSteward, getLocalQueue } from "../../../src/services/queue-service.js";

describe("local runner — Steward queue priority (#56)", () => {
  beforeEach(() => {
    processed.length = 0;
    (getLocalQueue("steward") as unknown[]).length = 0;
  });

  it("drains higher-importance Steward messages first, regardless of enqueue order", async () => {
    await enqueueSteward({ claimId: "mid", trigger: "structure_and_assess", context: "", importance: 0.5 });
    await enqueueSteward({ claimId: "high", trigger: "structure_and_assess", context: "", importance: 0.9 });
    await enqueueSteward({ claimId: "low", trigger: "structure_and_assess", context: "", importance: 0.1 });
    await enqueueSteward({ claimId: "top", trigger: "structure_and_assess", context: "", importance: 0.95 });

    await drainLocalQueues();

    expect(processed).toEqual(["top", "high", "mid", "low"]);
  });

  it("treats a missing importance as 0.5 (medium)", async () => {
    await enqueueSteward({ claimId: "explicit-low", trigger: "structure_and_assess", context: "", importance: 0.2 });
    await enqueueSteward({ claimId: "no-importance", trigger: "structure_and_assess", context: "" });
    await enqueueSteward({ claimId: "explicit-high", trigger: "structure_and_assess", context: "", importance: 0.8 });

    await drainLocalQueues();

    expect(processed).toEqual(["explicit-high", "no-importance", "explicit-low"]);
  });
});
