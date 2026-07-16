import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const claimTypeEnum = z.enum([
  "empirical_verifiable",
  "empirical_derived",
  "definitional",
  "evaluative",
  "causal",
  "normative",
]);

// The states the system actually writes (see claims.state in src/db/schema.ts):
// 'active' (live), 'merged' (merge loser, aliased via merged_into), 'deprecated'
// (reversed curator-created claim, soft-deleted), 'archived' (retired
// pipeline-epoch cohort). Contestation is an assessment status, not a lifecycle
// state.
export const claimStateEnum = z.enum([
  "active",
  "merged",
  "deprecated",
  "archived",
]);

export const assessmentStatusEnum = z.enum([
  "verified",
  "supported",
  "contested",
  "unsupported",
  "contradicted",
  "unknown",
]);

export const decompositionRelationEnum = z.enum([
  "requires",
  "supports",
  "contradicts",
  "specifies",
  "defines",
  "presupposes",
]);

export const stanceEnum = z.enum(["for", "against", "neutral"]);

// The types a caller may submit against an EXISTING claim via
// POST /contributions.
export const contributionTypeEnum = z.enum([
  "challenge",
  "support",
  "propose_merge",
  "propose_split",
  "propose_edit",
  "add_instance",
  "propose_argument",
]);

// Intake types (#157): suggestions that would mint NEW graph content. They are
// created internally by POST /claims/propose and POST /sources (never through
// the /contributions body, which requires a target claim) and have a null
// claim_id until review accepts and materializes them.
export const intakeContributionTypeEnum = z.enum([
  "propose_claim",
  "propose_source",
]);

// Every type a contribution row can carry — for list filters and display.
export const anyContributionTypeEnum = z.enum([
  ...contributionTypeEnum.options,
  ...intakeContributionTypeEnum.options,
]);

export const reviewDecisionEnum = z.enum([
  "accept",
  "reject",
  "escalate",
]);

export const arbitrationOutcomeEnum = z.enum([
  "uphold_original",
  "overturn",
  "modify",
  "mark_contested",
  "human_review",
]);

export const informationDepthEnum = z.enum(["cursory", "standard", "deep"]);

export const sourceTypeEnum = z.enum([
  "primary_data",
  "peer_reviewed",
  "government",
  "news_original",
  "news_secondary",
  "opinion",
  "social_media",
  "unknown",
]);
