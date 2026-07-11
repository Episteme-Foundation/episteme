import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every rawQuery so the tests can assert on the SQL the service
// emits without a Postgres instance (matching the reviewer-tools pattern).
const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []),
  awardKudos: vi.fn(async () => {}),
}));

vi.mock("../../../src/db/client.js", () => ({
  rawQuery: mocks.rawQuery,
  getDb: () => {
    throw new Error("reputation-service must not use getDb");
  },
}));

vi.mock("../../../src/services/kudos-service.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../../src/services/kudos-service.js")
  >();
  return { ...original, awardKudos: mocks.awardKudos };
});

import {
  applyReviewOutcome,
  reverseReviewOutcome,
  clampScore,
  reputationDeltaFor,
  trustLevelFor,
  checkContributionRateLimit,
  resetContributionRateLimiter,
  REPUTATION_RULES,
  REPUTATION_REASONS,
  AUTO_SUSPENSION_PREFIX,
} from "../../../src/services/reputation-service.js";

const CONTRIBUTION_ID = "11111111-1111-1111-1111-111111111111";
const CONTRIBUTOR_ID = "22222222-2222-2222-2222-222222222222";
const REVIEW_ID = "33333333-3333-3333-3333-333333333333";

function primeContributor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    reputation_score: 50,
    bad_faith_flags: 0,
    contribution_standing: "good",
    is_suspended: false,
    suspension_reason: null,
    ...overrides,
  };
}

/** Route the mock by SQL shape: contribution join, contributor row, events. */
function routeQueries(opts: {
  contributor?: Record<string, unknown>;
  importance?: number;
  events?: Array<{ delta: number; reason: string }>;
}) {
  mocks.rawQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM contributions")) {
      return [
        {
          contributor_id: CONTRIBUTOR_ID,
          importance: opts.importance ?? 0.5,
        },
      ];
    }
    if (sql.includes("FROM contributors")) {
      return [primeContributor(opts.contributor)];
    }
    if (sql.includes("FROM reputation_events")) {
      return opts.events ?? [];
    }
    return [];
  });
}

function updateCall(): { sql: string; params: unknown[] } {
  const call = mocks.rawQuery.mock.calls.find(([sql]) =>
    (sql as string).includes("UPDATE contributors")
  );
  expect(call).toBeDefined();
  return { sql: call![0] as string, params: call![1] as unknown[] };
}

function eventInserts(): unknown[][] {
  return mocks.rawQuery.mock.calls
    .filter(([sql]) => (sql as string).includes("INSERT INTO reputation_events"))
    .map(([, params]) => params as unknown[]);
}

beforeEach(() => {
  mocks.rawQuery.mockReset();
  mocks.awardKudos.mockReset();
});

describe("reputation rules (pure)", () => {
  it("maps decisions to deltas", () => {
    expect(reputationDeltaFor("accept")).toBe(REPUTATION_RULES.accepted);
    expect(reputationDeltaFor("reject")).toBe(REPUTATION_RULES.rejected);
    expect(reputationDeltaFor("escalate")).toBe(0);
  });

  it("clamps to [0, 100]", () => {
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(104)).toBe(100);
    expect(clampScore(37)).toBe(37);
  });

  it("derives trust levels from score and suspension", () => {
    expect(trustLevelFor(90, false)).toBe("trusted");
    expect(trustLevelFor(50, false)).toBe("standard");
    expect(trustLevelFor(30, false)).toBe("probationary");
    expect(trustLevelFor(10, false)).toBe("restricted");
    expect(trustLevelFor(90, true)).toBe("suspended");
  });
});

describe("applyReviewOutcome", () => {
  it("accept: raises reputation, logs the event, awards importance-scaled kudos", async () => {
    routeQueries({ importance: 1 });
    const outcome = await applyReviewOutcome({
      contributionId: CONTRIBUTION_ID,
      reviewId: REVIEW_ID,
      decision: "accept",
    });

    expect(outcome).toMatchObject({
      contributorId: CONTRIBUTOR_ID,
      previousScore: 50,
      newScore: 50 + REPUTATION_RULES.accepted,
      standing: "good",
      suspended: false,
      kudosAwarded: 5, // importance 1 → max kudos
    });

    const { sql, params } = updateCall();
    expect(sql).toContain("contributions_accepted = contributions_accepted + 1");
    expect(params[0]).toBe(52);

    const events = eventInserts();
    expect(events).toHaveLength(1);
    expect(events[0]).toContain(REPUTATION_REASONS.accepted);

    expect(mocks.awardKudos).toHaveBeenCalledWith(
      expect.objectContaining({
        contributorId: CONTRIBUTOR_ID,
        amount: 5,
        reason: "accepted_contribution",
      })
    );
  });

  it("sincere reject: small penalty, no standing change, no kudos", async () => {
    routeQueries({});
    const outcome = await applyReviewOutcome({
      contributionId: CONTRIBUTION_ID,
      decision: "reject",
    });

    expect(outcome!.newScore).toBe(50 + REPUTATION_RULES.rejected);
    expect(outcome!.standing).toBe("good");
    expect(mocks.awardKudos).not.toHaveBeenCalled();
    expect(eventInserts()).toHaveLength(1);
  });

  it("bad-faith reject: heavy penalty, must_pay standing, two ledger events", async () => {
    routeQueries({});
    const outcome = await applyReviewOutcome({
      contributionId: CONTRIBUTION_ID,
      decision: "reject",
      suspectedBadFaith: true,
      badFaithCategory: "spam",
    });

    expect(outcome!.newScore).toBe(
      50 + REPUTATION_RULES.rejected + REPUTATION_RULES.badFaithFlag
    );
    expect(outcome!.standing).toBe("must_pay");
    expect(outcome!.suspended).toBe(false);

    const events = eventInserts();
    expect(events).toHaveLength(2);
    expect(events[0]).toContain(REPUTATION_REASONS.rejected);
    expect(events[1]).toContain(REPUTATION_REASONS.badFaith);
  });

  it("ignores the bad-faith flag on non-reject decisions", async () => {
    routeQueries({});
    const outcome = await applyReviewOutcome({
      contributionId: CONTRIBUTION_ID,
      decision: "accept",
      suspectedBadFaith: true,
    });
    expect(outcome!.standing).toBe("good");
    expect(outcome!.newScore).toBe(50 + REPUTATION_RULES.accepted);
  });

  it("auto-suspends when the score falls below the threshold", async () => {
    routeQueries({
      contributor: primeContributor({
        reputation_score: 20,
        bad_faith_flags: 2,
        contribution_standing: "must_pay",
      }),
    });
    const outcome = await applyReviewOutcome({
      contributionId: CONTRIBUTION_ID,
      decision: "reject",
      suspectedBadFaith: true,
    });

    expect(outcome!.newScore).toBe(4);
    expect(outcome!.suspended).toBe(true);
    const { params } = updateCall();
    // $4 = suspend flag, $5 = auto-suspension reason
    expect(params[3]).toBe(true);
    expect(String(params[4])).toContain(AUTO_SUSPENSION_PREFIX);
  });

  it("escalate: counter only, no reputation event, no kudos", async () => {
    routeQueries({});
    const outcome = await applyReviewOutcome({
      contributionId: CONTRIBUTION_ID,
      decision: "escalate",
    });
    expect(outcome!.newScore).toBe(50);
    expect(eventInserts()).toHaveLength(0);
    expect(mocks.awardKudos).not.toHaveBeenCalled();
    expect(updateCall().sql).toContain(
      "contributions_escalated = contributions_escalated + 1"
    );
  });

  it("returns null for an unknown contribution", async () => {
    mocks.rawQuery.mockResolvedValue([]);
    expect(
      await applyReviewOutcome({
        contributionId: CONTRIBUTION_ID,
        decision: "accept",
      })
    ).toBeNull();
  });
});

describe("reverseReviewOutcome (appeal overturn)", () => {
  it("compensates penalties, clears the flag, restores standing, lifts auto-suspension", async () => {
    routeQueries({
      importance: 0.5,
      contributor: primeContributor({
        reputation_score: 8,
        bad_faith_flags: 1,
        contribution_standing: "must_pay",
        is_suspended: true,
        suspension_reason: `${AUTO_SUSPENSION_PREFIX} score fell below 10`,
      }),
      events: [
        { delta: REPUTATION_RULES.rejected, reason: REPUTATION_REASONS.rejected },
        { delta: REPUTATION_RULES.badFaithFlag, reason: REPUTATION_REASONS.badFaith },
      ],
    });

    const result = await reverseReviewOutcome({ contributionId: CONTRIBUTION_ID });

    // 8 - (-16) + 2 = 26
    expect(result).toMatchObject({
      previousScore: 8,
      newScore: 26,
      standingRestored: true,
      unsuspended: true,
    });
    expect(result!.kudosAwarded).toBe(3 + 2); // importance 0.5 → 3, +2 bonus

    const events = eventInserts();
    expect(events).toHaveLength(1);
    expect(events[0]).toContain(REPUTATION_REASONS.overturned);

    expect(mocks.awardKudos).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "survived_appeal", amount: 5 })
    );
  });

  it("keeps must_pay standing when other bad-faith flags remain", async () => {
    routeQueries({
      contributor: primeContributor({
        reputation_score: 20,
        bad_faith_flags: 2,
        contribution_standing: "must_pay",
      }),
      events: [
        { delta: REPUTATION_RULES.rejected, reason: REPUTATION_REASONS.rejected },
        { delta: REPUTATION_RULES.badFaithFlag, reason: REPUTATION_REASONS.badFaith },
      ],
    });

    const result = await reverseReviewOutcome({ contributionId: CONTRIBUTION_ID });
    expect(result!.standingRestored).toBe(false);
  });

  it("does not lift a manual (non-reputation) suspension", async () => {
    routeQueries({
      contributor: primeContributor({
        reputation_score: 40,
        bad_faith_flags: 1,
        contribution_standing: "must_pay",
        is_suspended: true,
        suspension_reason: "manual: ToS violation",
      }),
      events: [
        { delta: REPUTATION_RULES.rejected, reason: REPUTATION_REASONS.rejected },
        { delta: REPUTATION_RULES.badFaithFlag, reason: REPUTATION_REASONS.badFaith },
      ],
    });

    const result = await reverseReviewOutcome({ contributionId: CONTRIBUTION_ID });
    expect(result!.unsuspended).toBe(false);
  });

  it("is idempotent: a second overturn is a no-op", async () => {
    routeQueries({
      events: [
        { delta: REPUTATION_RULES.rejected, reason: REPUTATION_REASONS.rejected },
        { delta: 3, reason: REPUTATION_REASONS.overturned },
      ],
    });
    expect(
      await reverseReviewOutcome({ contributionId: CONTRIBUTION_ID })
    ).toBeNull();
  });

  it("no-ops when the contribution was never penalized", async () => {
    routeQueries({
      events: [
        { delta: REPUTATION_RULES.accepted, reason: REPUTATION_REASONS.accepted },
      ],
    });
    expect(
      await reverseReviewOutcome({ contributionId: CONTRIBUTION_ID })
    ).toBeNull();
  });
});

describe("contribution rate limit (sybil sandbox)", () => {
  beforeEach(() => resetContributionRateLimiter());

  const DAY = 24 * 3_600_000;

  it("sandboxes brand-new accounts at the tighter limit (default 3/h)", () => {
    const fresh = {
      id: "new-1",
      reputationScore: 50,
      createdAt: new Date(),
    };
    for (let i = 0; i < 3; i++) {
      expect(checkContributionRateLimit(fresh).limited).toBe(false);
    }
    const fourth = checkContributionRateLimit(fresh);
    expect(fourth.limited).toBe(true);
    expect(fourth.sandboxed).toBe(true);
    expect(fourth.limitPerHour).toBe(3);
  });

  it("sandboxes low-reputation accounts regardless of age", () => {
    const lowRep = {
      id: "low-1",
      reputationScore: 30,
      createdAt: new Date(Date.now() - 30 * DAY),
    };
    expect(checkContributionRateLimit(lowRep).sandboxed).toBe(true);
    expect(checkContributionRateLimit(lowRep).limitPerHour).toBe(3);
  });

  it("gives established accounts the standard limit (default 10/h)", () => {
    const established = {
      id: "est-1",
      reputationScore: 60,
      createdAt: new Date(Date.now() - 30 * DAY),
    };
    for (let i = 0; i < 10; i++) {
      expect(checkContributionRateLimit(established).limited).toBe(false);
    }
    const eleventh = checkContributionRateLimit(established);
    expect(eleventh.limited).toBe(true);
    expect(eleventh.sandboxed).toBe(false);
  });

  it("tracks windows per contributor", () => {
    const a = { id: "a", reputationScore: 30, createdAt: new Date() };
    const b = { id: "b", reputationScore: 30, createdAt: new Date() };
    for (let i = 0; i < 3; i++) checkContributionRateLimit(a);
    expect(checkContributionRateLimit(a).limited).toBe(true);
    expect(checkContributionRateLimit(b).limited).toBe(false);
  });
});
