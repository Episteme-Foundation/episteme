/**
 * Claim events service -- the unified per-claim history (issue #175).
 *
 * Composes everything that has happened to a claim into one chronological
 * record: assessments (from the append-only assessments table), contributions
 * and the decisions made about them (reviews, appeals, arbitration), and the
 * Steward's audit-log entries. Most claims have only a creation and a single
 * assessment; a contested claim can accumulate dozens of entries from several
 * parties — the event list is flat and typed so both extremes render the same
 * way.
 *
 * composeClaimEvents() is pure (rows in, events out) so the merge/ordering
 * logic is testable without a database; getClaimEvents() is the thin fetch
 * wrapper the route calls.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  assessments,
  contributions,
  contributionReviews,
  appeals,
  arbitrationResults,
  auditLog,
} from "../db/schema.js";

// One flat discriminated union rather than nested threads: a review or an
// arbitration is an event in its own right (it can trigger a reassessment),
// so it gets its own timestamped entry, cross-referenced to its contribution
// by id. Field names are already the API's snake_case — the route passes
// events through untouched.
export type ClaimEvent =
  | {
      kind: "created";
      id: string;
      at: string;
      actor: string;
    }
  | {
      kind: "assessment";
      id: string;
      at: string;
      actor: string;
      assessment_id: string;
      status: string;
      confidence: number;
      claim_credence: number | null;
      summary: string;
      trigger: string | null;
      trigger_context: string | null;
      is_current: boolean;
      // What this assessment superseded — null on the first one. Computed
      // here so clients can render "verified → supported" without holding
      // the whole history.
      prev_status: string | null;
      prev_confidence: number | null;
    }
  | {
      kind: "contribution";
      id: string;
      at: string;
      actor: string;
      contribution_id: string;
      contribution_type: string;
      content: string;
      evidence_urls: string[];
      // Current disposition, denormalized so a paginated window that has
      // dropped the review event still shows how the exchange ended.
      review_status: string;
    }
  | {
      kind: "review";
      id: string;
      at: string;
      actor: string;
      review_id: string;
      contribution_id: string;
      contribution_type: string | null;
      decision: string;
      reasoning: string;
      confidence: number;
      policy_citations: string[];
      suspected_bad_faith: boolean;
    }
  | {
      kind: "appeal";
      id: string;
      at: string;
      actor: string;
      appeal_id: string;
      contribution_id: string;
      reasoning: string;
      status: string;
    }
  | {
      kind: "arbitration";
      id: string;
      at: string;
      actor: string;
      arbitration_id: string;
      contribution_id: string;
      appeal_id: string | null;
      outcome: string;
      reasoning: string;
      consensus_achieved: boolean | null;
      human_review_recommended: boolean;
    }
  | {
      kind: "steward_note";
      id: string;
      at: string;
      actor: string;
      audit_id: string;
      action: string;
      reasoning: string;
    };

// Structural row types — the drizzle $inferSelect shapes the composer needs,
// declared loosely so tests can pass plain objects.
export interface ClaimEventsInput {
  claim: { id: string; createdBy: string; createdAt: Date };
  assessments: Array<{
    id: string;
    status: string;
    confidence: number;
    claimCredence: number | null;
    summary: string | null;
    reasoningTrace: string;
    isCurrent: boolean;
    trigger: string | null;
    triggerContext: string | null;
    assessedAt: Date;
  }>;
  contributions: Array<{
    id: string;
    contributorId: string;
    contributionType: string;
    content: string;
    evidenceUrls: string[];
    reviewStatus: string;
    submittedAt: Date;
  }>;
  reviews: Array<{
    id: string;
    contributionId: string;
    decision: string;
    reasoning: string;
    confidence: number;
    policyCitations: string[];
    suspectedBadFaith: boolean;
    reviewedAt: Date;
    reviewedBy: string;
  }>;
  appeals: Array<{
    id: string;
    contributionId: string;
    appellantId: string;
    appealReasoning: string;
    status: string;
    submittedAt: Date;
  }>;
  arbitrations: Array<{
    id: string;
    contributionId: string;
    appealId: string | null;
    outcome: string;
    reasoning: string;
    consensusAchieved: boolean | null;
    humanReviewRecommended: boolean;
    arbitratedAt: Date;
    arbitratedBy: string;
  }>;
  auditEntries: Array<{
    id: string;
    action: string;
    reasoning: string;
    createdBy: string;
    createdAt: Date;
  }>;
}

// Tie-break rank for events sharing a timestamp, in causal order: a claim
// exists before it is assessed; a contribution precedes the decision on it.
const KIND_ORDER: Record<ClaimEvent["kind"], number> = {
  created: 0,
  contribution: 1,
  review: 2,
  appeal: 3,
  arbitration: 4,
  assessment: 5,
  steward_note: 6,
};

export function composeClaimEvents(input: ClaimEventsInput): ClaimEvent[] {
  const events: ClaimEvent[] = [];

  events.push({
    kind: "created",
    id: `created:${input.claim.id}`,
    at: input.claim.createdAt.toISOString(),
    actor: input.claim.createdBy,
  });

  const byTime = [...input.assessments].sort(
    (a, b) => a.assessedAt.getTime() - b.assessedAt.getTime()
  );
  byTime.forEach((a, i) => {
    const prev = byTime[i - 1] ?? null;
    events.push({
      kind: "assessment",
      id: `assessment:${a.id}`,
      at: a.assessedAt.toISOString(),
      // Assessments carry no author column; the Steward is the only writer.
      actor: "claim_steward",
      assessment_id: a.id,
      status: a.status,
      confidence: a.confidence,
      claim_credence: a.claimCredence ?? null,
      // Reader-facing body; fall back to the reasoning trace for assessments
      // written before the summary/reasoning split (nullable column).
      summary: a.summary ?? a.reasoningTrace,
      trigger: a.trigger,
      trigger_context: a.triggerContext,
      is_current: a.isCurrent,
      prev_status: prev?.status ?? null,
      prev_confidence: prev?.confidence ?? null,
    });
  });

  const contributionTypeById = new Map(
    input.contributions.map((c) => [c.id, c.contributionType])
  );

  for (const c of input.contributions) {
    events.push({
      kind: "contribution",
      id: `contribution:${c.id}`,
      at: c.submittedAt.toISOString(),
      actor: c.contributorId,
      contribution_id: c.id,
      contribution_type: c.contributionType,
      content: c.content,
      evidence_urls: c.evidenceUrls,
      review_status: c.reviewStatus,
    });
  }

  for (const r of input.reviews) {
    events.push({
      kind: "review",
      id: `review:${r.id}`,
      at: r.reviewedAt.toISOString(),
      actor: r.reviewedBy,
      review_id: r.id,
      contribution_id: r.contributionId,
      contribution_type: contributionTypeById.get(r.contributionId) ?? null,
      decision: r.decision,
      reasoning: r.reasoning,
      confidence: r.confidence,
      policy_citations: r.policyCitations,
      suspected_bad_faith: r.suspectedBadFaith,
    });
  }

  for (const ap of input.appeals) {
    events.push({
      kind: "appeal",
      id: `appeal:${ap.id}`,
      at: ap.submittedAt.toISOString(),
      actor: ap.appellantId,
      appeal_id: ap.id,
      contribution_id: ap.contributionId,
      reasoning: ap.appealReasoning,
      status: ap.status,
    });
  }

  for (const arb of input.arbitrations) {
    events.push({
      kind: "arbitration",
      id: `arbitration:${arb.id}`,
      at: arb.arbitratedAt.toISOString(),
      actor: arb.arbitratedBy,
      arbitration_id: arb.id,
      contribution_id: arb.contributionId,
      appeal_id: arb.appealId ?? null,
      outcome: arb.outcome,
      reasoning: arb.reasoning,
      consensus_achieved: arb.consensusAchieved ?? null,
      human_review_recommended: arb.humanReviewRecommended,
    });
  }

  for (const entry of input.auditEntries) {
    events.push({
      kind: "steward_note",
      id: `steward_note:${entry.id}`,
      at: entry.createdAt.toISOString(),
      actor: entry.createdBy,
      audit_id: entry.id,
      action: entry.action,
      reasoning: entry.reasoning,
    });
  }

  // Newest first, matching the assessments endpoint; causal kind order breaks
  // same-timestamp ties (so creation never sorts after the first assessment).
  return events.sort(
    (a, b) =>
      b.at.localeCompare(a.at) || KIND_ORDER[b.kind] - KIND_ORDER[a.kind]
  );
}

export async function getClaimEvents(
  claim: { id: string; createdBy: string; createdAt: Date },
  options: { limit?: number; offset?: number } = {}
): Promise<{ events: ClaimEvent[]; total: number }> {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  const [assessmentRows, contributionRows, auditRows] = await Promise.all([
    db.select().from(assessments).where(eq(assessments.claimId, claim.id)),
    db.select().from(contributions).where(eq(contributions.claimId, claim.id)),
    db.select().from(auditLog).where(eq(auditLog.claimId, claim.id)),
  ]);

  const contributionIds = contributionRows.map((c) => c.id);
  const [reviewRows, appealRows, arbitrationRows] =
    contributionIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(contributionReviews)
            .where(inArray(contributionReviews.contributionId, contributionIds)),
          db
            .select()
            .from(appeals)
            .where(inArray(appeals.contributionId, contributionIds)),
          db
            .select()
            .from(arbitrationResults)
            .where(inArray(arbitrationResults.contributionId, contributionIds)),
        ])
      : [[], [], []];

  const events = composeClaimEvents({
    claim,
    assessments: assessmentRows,
    contributions: contributionRows,
    reviews: reviewRows,
    appeals: appealRows,
    arbitrations: arbitrationRows,
    auditEntries: auditRows,
  });

  return { events: events.slice(offset, offset + limit), total: events.length };
}
