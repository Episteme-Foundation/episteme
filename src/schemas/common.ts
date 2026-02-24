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

export const claimStateEnum = z.enum([
  "active",
  "under_review",
  "contested",
  "merged",
  "deprecated",
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

export const contributionTypeEnum = z.enum([
  "challenge",
  "support",
  "propose_merge",
  "propose_split",
  "propose_edit",
  "add_instance",
  "propose_argument",
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
