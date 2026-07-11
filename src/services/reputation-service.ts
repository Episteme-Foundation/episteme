/**
 * Reputation service (#71) — makes `contributors.reputation_score`
 * load-bearing.
 *
 * Principles (from the issue):
 *  - Good-faith contribution is always free — a sincere contribution rejected
 *    on the merits costs a little reputation, never money.
 *  - Bad faith has a credible cost: ONE suspected-bad-faith flag flips the
 *    contributor into 'must_pay' standing (contributing requires a deposit —
 *    the payment seam; no payment rail exists yet, so POST /contributions
 *    returns 402 DEPOSIT_REQUIRED until the flag is overturned on appeal).
 *  - Reputation gates privileges: low scores auto-suspend, and low-reputation
 *    or brand-new accounts are rate-limited to blunt sybil floods.
 *  - Every change is an append-only reputation_events row, so standing is
 *    auditable and reversible: appeal overturns insert compensating events
 *    instead of editing history.
 *
 * All writes go through rawQuery so the review pipeline (reviewer/arbitrator
 * tools) has one testable seam, matching the existing counter-update pattern.
 */
import { rawQuery } from "../db/client.js";
import { loadConfig } from "../config.js";
import {
  awardKudos,
  kudosForImportance,
  KUDOS_REASONS,
  SURVIVED_APPEAL_BONUS,
} from "./kudos-service.js";

// ---------------------------------------------------------------------------
// Rules (pure, exported for tests and prompts)
// ---------------------------------------------------------------------------

export const REPUTATION_RULES = {
  min: 0,
  max: 100,
  /** Accepted good-faith contribution. */
  accepted: 2,
  /** Rejected on the merits — sincere but wrong stays cheap. */
  rejected: -1,
  /** Escalation is not a judgment; no reputation change. */
  escalated: 0,
  /** Suspected bad faith — one flag also flips standing to 'must_pay'. */
  badFaithFlag: -15,
  /**
   * Auto-suspension threshold: dropping below this suspends the account.
   * From the default 50, that is ~3 bad-faith flags but ~41 sincere
   * rejections — abuse escalates fast, sincerity never suspends by accident.
   */
  suspendBelow: 10,
} as const;

export const BAD_FAITH_CATEGORIES = [
  "spam",
  "vandalism",
  "sybil",
  "misinformation",
] as const;
export type BadFaithCategory = (typeof BAD_FAITH_CATEGORIES)[number];

export const REPUTATION_REASONS = {
  accepted: "contribution_accepted",
  rejected: "contribution_rejected",
  badFaith: "bad_faith_flag",
  overturned: "appeal_overturned",
} as const;

/** Marks suspensions this service imposed, so appeals can lift exactly those. */
export const AUTO_SUSPENSION_PREFIX = "reputation:";

export function clampScore(score: number): number {
  return Math.min(REPUTATION_RULES.max, Math.max(REPUTATION_RULES.min, score));
}

export function reputationDeltaFor(
  decision: "accept" | "reject" | "escalate"
): number {
  switch (decision) {
    case "accept":
      return REPUTATION_RULES.accepted;
    case "reject":
      return REPUTATION_RULES.rejected;
    case "escalate":
      return REPUTATION_RULES.escalated;
  }
}

/**
 * Trust level from score — the thresholds the Contribution Reviewer already
 * reasons with (single definition; governance tools import this).
 */
export function trustLevelFor(score: number, isSuspended: boolean): string {
  if (isSuspended) return "suspended";
  if (score >= 80) return "trusted";
  if (score >= 50) return "standard";
  if (score >= 20) return "probationary";
  return "restricted";
}

// ---------------------------------------------------------------------------
// Review outcome → reputation / standing / kudos
// ---------------------------------------------------------------------------

export interface ReviewOutcomeInput {
  contributionId: string;
  reviewId?: string | null;
  decision: "accept" | "reject" | "escalate";
  suspectedBadFaith?: boolean;
  badFaithCategory?: string | null;
}

export interface ReviewOutcomeSummary {
  contributorId: string;
  previousScore: number;
  newScore: number;
  standing: string;
  suspended: boolean;
  kudosAwarded: number;
}

/**
 * Apply the full consequences of a review decision: contribution counters,
 * reputation events + score, bad-faith standing, auto-suspension, and kudos
 * for acceptances. Called by the reviewer tool after the review row is
 * written (and by nothing else — one write path).
 */
export async function applyReviewOutcome(
  input: ReviewOutcomeInput
): Promise<ReviewOutcomeSummary | null> {
  const [contribution] = await rawQuery<{
    contributor_id: string;
    importance: number;
  }>(
    `SELECT c.contributor_id, cl.importance
     FROM contributions c
     JOIN claims cl ON cl.id = c.claim_id
     WHERE c.id = $1`,
    [input.contributionId]
  );
  if (!contribution) return null;

  const [contributor] = await rawQuery<{
    reputation_score: number;
    bad_faith_flags: number;
    contribution_standing: string;
    is_suspended: boolean;
  }>(
    `SELECT reputation_score, bad_faith_flags, contribution_standing, is_suspended
     FROM contributors WHERE id = $1`,
    [contribution.contributor_id]
  );
  if (!contributor) return null;

  // Bad faith is only meaningful on a rejection (a sincere-but-wrong reject
  // must never carry the flag's consequences).
  const badFaith = input.suspectedBadFaith === true && input.decision === "reject";

  const baseDelta = reputationDeltaFor(input.decision);
  const totalDelta = baseDelta + (badFaith ? REPUTATION_RULES.badFaithFlag : 0);
  const previousScore = contributor.reputation_score;
  const newScore = clampScore(previousScore + totalDelta);

  const counterColumn =
    input.decision === "accept"
      ? "contributions_accepted"
      : input.decision === "reject"
        ? "contributions_rejected"
        : "contributions_escalated";

  const suspend =
    !contributor.is_suspended && newScore < REPUTATION_RULES.suspendBelow;
  const standing = badFaith ? "must_pay" : contributor.contribution_standing;

  await rawQuery(
    `UPDATE contributors SET
       ${counterColumn} = ${counterColumn} + 1,
       reputation_score = $1,
       contribution_standing = $2,
       bad_faith_flags = bad_faith_flags + $3,
       is_suspended = is_suspended OR $4,
       suspension_reason = CASE WHEN $4 THEN $5 ELSE suspension_reason END,
       last_active_at = now()
     WHERE id = $6`,
    [
      newScore,
      standing,
      badFaith ? 1 : 0,
      suspend,
      `${AUTO_SUSPENSION_PREFIX} score fell below ${REPUTATION_RULES.suspendBelow} after ${
        badFaith ? "a suspected bad-faith contribution" : "repeated rejections"
      }`,
      contribution.contributor_id,
    ]
  );

  // Ledger: one event per cause, so an appeal can reverse exactly what
  // happened (a bad-faith rejection is two events: the rejection + the flag).
  const events: Array<{ delta: number; reason: string }> = [];
  if (input.decision === "accept") {
    events.push({ delta: baseDelta, reason: REPUTATION_REASONS.accepted });
  } else if (input.decision === "reject") {
    events.push({ delta: baseDelta, reason: REPUTATION_REASONS.rejected });
    if (badFaith) {
      events.push({
        delta: REPUTATION_RULES.badFaithFlag,
        reason: REPUTATION_REASONS.badFaith,
      });
    }
  }
  let running = previousScore;
  for (const event of events) {
    running = clampScore(running + event.delta);
    await rawQuery(
      `INSERT INTO reputation_events
         (contributor_id, contribution_id, review_id, delta, score_after, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        contribution.contributor_id,
        input.contributionId,
        input.reviewId ?? null,
        event.delta,
        running,
        event.reason,
      ]
    );
  }

  // Recognition: accepted contributions earn kudos scaled by how load-bearing
  // the target claim is.
  let kudosAwarded = 0;
  if (input.decision === "accept") {
    kudosAwarded = kudosForImportance(contribution.importance);
    await awardKudos({
      contributorId: contribution.contributor_id,
      contributionId: input.contributionId,
      amount: kudosAwarded,
      reason: KUDOS_REASONS.acceptedContribution,
    });
  }

  return {
    contributorId: contribution.contributor_id,
    previousScore,
    newScore,
    standing,
    suspended: contributor.is_suspended || suspend,
    kudosAwarded,
  };
}

// ---------------------------------------------------------------------------
// Appeal overturn → restore
// ---------------------------------------------------------------------------

export interface ReversalSummary {
  contributorId: string;
  previousScore: number;
  newScore: number;
  standingRestored: boolean;
  unsuspended: boolean;
  kudosAwarded: number;
}

/**
 * Reverse the consequences of a rejection that arbitration overturned:
 * compensate the reputation ledger, move the rejected counter to accepted,
 * clear the bad-faith flag (restoring 'good' standing when it was the only
 * one), lift a reputation-imposed suspension, and award the accepted +
 * survived-appeal kudos. Idempotent per contribution.
 */
export async function reverseReviewOutcome(input: {
  contributionId: string;
}): Promise<ReversalSummary | null> {
  const [contribution] = await rawQuery<{
    contributor_id: string;
    importance: number;
  }>(
    `SELECT c.contributor_id, cl.importance
     FROM contributions c
     JOIN claims cl ON cl.id = c.claim_id
     WHERE c.id = $1`,
    [input.contributionId]
  );
  if (!contribution) return null;

  const events = await rawQuery<{ delta: number; reason: string }>(
    `SELECT delta, reason FROM reputation_events WHERE contribution_id = $1`,
    [input.contributionId]
  );
  // Nothing to reverse (never penalized), or already reversed.
  const penalties = events.filter(
    (e) =>
      e.reason === REPUTATION_REASONS.rejected ||
      e.reason === REPUTATION_REASONS.badFaith
  );
  if (penalties.length === 0) return null;
  if (events.some((e) => e.reason === REPUTATION_REASONS.overturned)) {
    return null;
  }

  const [contributor] = await rawQuery<{
    reputation_score: number;
    bad_faith_flags: number;
    contribution_standing: string;
    is_suspended: boolean;
    suspension_reason: string | null;
  }>(
    `SELECT reputation_score, bad_faith_flags, contribution_standing,
            is_suspended, suspension_reason
     FROM contributors WHERE id = $1`,
    [contribution.contributor_id]
  );
  if (!contributor) return null;

  const hadBadFaithFlag = penalties.some(
    (e) => e.reason === REPUTATION_REASONS.badFaith
  );
  const penaltySum = penalties.reduce((sum, e) => sum + e.delta, 0);
  // Undo the penalties, then credit the acceptance the contribution deserved.
  const reversalDelta = -penaltySum + REPUTATION_RULES.accepted;
  const previousScore = contributor.reputation_score;
  const newScore = clampScore(previousScore + reversalDelta);

  const remainingFlags = hadBadFaithFlag
    ? Math.max(0, contributor.bad_faith_flags - 1)
    : contributor.bad_faith_flags;
  const standingRestored =
    contributor.contribution_standing === "must_pay" && remainingFlags === 0;

  // Lift a suspension only if this service imposed it and the restored score
  // clears the threshold — a manual suspension stays a human call.
  const unsuspend =
    contributor.is_suspended &&
    (contributor.suspension_reason ?? "").startsWith(AUTO_SUSPENSION_PREFIX) &&
    newScore >= REPUTATION_RULES.suspendBelow;

  await rawQuery(
    `UPDATE contributors SET
       contributions_rejected = GREATEST(0, contributions_rejected - 1),
       contributions_accepted = contributions_accepted + 1,
       reputation_score = $1,
       bad_faith_flags = $2,
       contribution_standing = $3,
       is_suspended = CASE WHEN $4 THEN false ELSE is_suspended END,
       suspension_reason = CASE WHEN $4 THEN NULL ELSE suspension_reason END
     WHERE id = $5`,
    [
      newScore,
      remainingFlags,
      standingRestored ? "good" : contributor.contribution_standing,
      unsuspend,
      contribution.contributor_id,
    ]
  );

  await rawQuery(
    `INSERT INTO reputation_events
       (contributor_id, contribution_id, review_id, delta, score_after, reason)
     VALUES ($1, $2, NULL, $3, $4, $5)`,
    [
      contribution.contributor_id,
      input.contributionId,
      reversalDelta,
      newScore,
      REPUTATION_REASONS.overturned,
    ]
  );

  // The contribution is now accepted AND survived scrutiny.
  const kudosAwarded =
    kudosForImportance(contribution.importance) + SURVIVED_APPEAL_BONUS;
  await awardKudos({
    contributorId: contribution.contributor_id,
    contributionId: input.contributionId,
    amount: kudosAwarded,
    reason: KUDOS_REASONS.survivedAppeal,
  });

  return {
    contributorId: contribution.contributor_id,
    previousScore,
    newScore,
    standingRestored,
    unsuspended: unsuspend,
    kudosAwarded,
  };
}

// ---------------------------------------------------------------------------
// Sybil / flood sandbox: contribution rate limiting
// ---------------------------------------------------------------------------

// contributorId → timestamps (ms) of contributions within the last hour.
// In-memory sliding window, same construction as the agentic rate limit —
// a blunt backstop, not an accounting system.
const windows = new Map<string, number[]>();

/** Test hook. */
export function resetContributionRateLimiter(): void {
  windows.clear();
}

const NEW_ACCOUNT_WINDOW_MS = 24 * 3_600_000;

export interface ContributionRateCheck {
  limited: boolean;
  limitPerHour: number;
  sandboxed: boolean;
}

/**
 * Per-contributor hourly cap on contributions. Low-reputation (< 50) and
 * brand-new (< 24h) accounts get the tighter sandbox limit so a sybil flood
 * of fresh accounts can't overwhelm review. 0 disables a limit.
 */
export function checkContributionRateLimit(contributor: {
  id: string;
  reputationScore: number;
  createdAt: Date;
}): ContributionRateCheck {
  const config = loadConfig();
  const isNew =
    Date.now() - contributor.createdAt.getTime() < NEW_ACCOUNT_WINDOW_MS;
  const sandboxed = contributor.reputationScore < 50 || isNew;
  const limitPerHour = sandboxed
    ? config.newContributorRateLimitPerHour
    : config.contributionRateLimitPerHour;

  if (limitPerHour <= 0) return { limited: false, limitPerHour, sandboxed };

  const now = Date.now();
  const cutoff = now - 3_600_000;
  const hits = (windows.get(contributor.id) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limitPerHour) {
    windows.set(contributor.id, hits);
    return { limited: true, limitPerHour, sandboxed };
  }
  hits.push(now);
  windows.set(contributor.id, hits);
  return { limited: false, limitPerHour, sandboxed };
}
