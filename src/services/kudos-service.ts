/**
 * Kudos service (#71) — recognition of *helpful* contributions.
 *
 * Kudos is deliberately a separate signal from reputation: reputation gates
 * privileges (can you contribute freely?), kudos recognizes value (how much
 * did your accepted work matter?). It is stored as an append-only ledger
 * (kudos_events) with a denormalized total on the contributor row, mirroring
 * how llm_usage rows would map onto a consumer credits ledger — so a future
 * payout provider can convert the ledger to money without re-architecture.
 *
 * Assignment today is deterministic ("system"): accepted contributions earn
 * kudos scaled by the target claim's importance, and contributions that
 * survive appeal scrutiny earn a bonus. Deterministic rules are harder to
 * game than an LLM judgment and need no extra model spend; peer signal or
 * downstream "did this change the assessment?" detection can join later as
 * additional awardedBy sources (see docs/reputation.md).
 */
import { rawQuery } from "../db/client.js";

export const KUDOS_REASONS = {
  acceptedContribution: "accepted_contribution",
  survivedAppeal: "survived_appeal",
} as const;

/** Extra kudos for an acceptance won through arbitration (survived scrutiny). */
export const SURVIVED_APPEAL_BONUS = 2;

/**
 * Kudos for an accepted contribution, scaled by how load-bearing the target
 * claim is (claims.importance, 0..1): 1 kudos for a peripheral claim up to 5
 * for a maximally important one.
 */
export function kudosForImportance(importance: number): number {
  const clamped = Math.min(1, Math.max(0, importance));
  return 1 + Math.round(clamped * 4);
}

export interface KudosAward {
  contributorId: string;
  contributionId?: string | null;
  amount: number;
  reason: string;
  awardedBy?: string;
}

/** Append a ledger event and keep the denormalized total in sync. */
export async function awardKudos(input: KudosAward): Promise<void> {
  if (input.amount <= 0) return;
  await rawQuery(
    `INSERT INTO kudos_events (contributor_id, contribution_id, amount, reason, awarded_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.contributorId,
      input.contributionId ?? null,
      input.amount,
      input.reason,
      input.awardedBy ?? "system",
    ]
  );
  await rawQuery(`UPDATE contributors SET kudos = kudos + $1 WHERE id = $2`, [
    input.amount,
    input.contributorId,
  ]);
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  kudos: number;
  reputationScore: number;
  contributionsAccepted: number;
  createdAt: Date;
}

/** Top contributors by kudos. Suspended accounts are excluded. */
export async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const rows = await rawQuery<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    kudos: number;
    reputation_score: number;
    contributions_accepted: number;
    created_at: Date;
  }>(
    `SELECT id, display_name, avatar_url, kudos, reputation_score,
            contributions_accepted, created_at
     FROM contributors
     WHERE kudos > 0 AND is_suspended = false
     ORDER BY kudos DESC, contributions_accepted DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    kudos: r.kudos,
    reputationScore: r.reputation_score,
    contributionsAccepted: r.contributions_accepted,
    createdAt: r.created_at,
  }));
}

export interface KudosEventRow {
  id: string;
  contributionId: string | null;
  amount: number;
  reason: string;
  awardedBy: string;
  createdAt: Date;
}

/** Recent kudos events for a contributor (public profile detail). */
export async function listKudosEvents(
  contributorId: string,
  limit = 20
): Promise<KudosEventRow[]> {
  const rows = await rawQuery<{
    id: string;
    contribution_id: string | null;
    amount: number;
    reason: string;
    awarded_by: string;
    created_at: Date;
  }>(
    `SELECT id, contribution_id, amount, reason, awarded_by, created_at
     FROM kudos_events
     WHERE contributor_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [contributorId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    contributionId: r.contribution_id,
    amount: r.amount,
    reason: r.reason,
    awardedBy: r.awarded_by,
    createdAt: r.created_at,
  }));
}
