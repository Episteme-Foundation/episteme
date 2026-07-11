import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []),
}));

vi.mock("../../../src/db/client.js", () => ({
  rawQuery: mocks.rawQuery,
  getDb: () => {
    throw new Error("kudos-service must not use getDb");
  },
}));

import {
  awardKudos,
  kudosForImportance,
} from "../../../src/services/kudos-service.js";

beforeEach(() => mocks.rawQuery.mockReset().mockResolvedValue([]));

describe("kudosForImportance", () => {
  it("scales 1..5 with claim importance", () => {
    expect(kudosForImportance(0)).toBe(1);
    expect(kudosForImportance(0.5)).toBe(3);
    expect(kudosForImportance(1)).toBe(5);
  });

  it("clamps out-of-range importance", () => {
    expect(kudosForImportance(-2)).toBe(1);
    expect(kudosForImportance(7)).toBe(5);
  });
});

describe("awardKudos", () => {
  it("appends a ledger event and keeps the denormalized total in sync", async () => {
    await awardKudos({
      contributorId: "c-1",
      contributionId: "k-1",
      amount: 3,
      reason: "accepted_contribution",
    });

    const [insert, update] = mocks.rawQuery.mock.calls;
    expect(insert[0]).toContain("INSERT INTO kudos_events");
    expect(insert[1]).toEqual(["c-1", "k-1", 3, "accepted_contribution", "system"]);
    expect(update[0]).toContain("kudos = kudos + $1");
    expect(update[1]).toEqual([3, "c-1"]);
  });

  it("ignores non-positive awards (the ledger only ever accrues)", async () => {
    await awardKudos({
      contributorId: "c-1",
      amount: 0,
      reason: "accepted_contribution",
    });
    expect(mocks.rawQuery).not.toHaveBeenCalled();
  });
});
