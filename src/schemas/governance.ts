import { z } from "zod";
import {
  uuidSchema,
  paginationSchema,
  contributionTypeEnum,
} from "./common.js";

// ---- Request schemas ----

export const createContributionBody = z.object({
  claim_id: uuidSchema,
  contributor_external_id: z.string().min(1),
  contributor_display_name: z.string().min(1),
  contribution_type: contributionTypeEnum,
  content: z.string().min(1).max(10000),
  evidence_urls: z.array(z.string().url()).optional(),
  merge_target_claim_id: uuidSchema.optional(),
  proposed_canonical_form: z.string().max(2000).optional(),
});

export const listContributionsParams = paginationSchema.extend({
  claim_id: uuidSchema.optional(),
  status: z.string().optional(),
  type: contributionTypeEnum.optional(),
});

export const createAppealBody = z.object({
  contribution_id: uuidSchema,
  contributor_external_id: z.string().min(1),
  contributor_display_name: z.string().min(1),
  appeal_reasoning: z.string().min(1).max(10000),
});

// ---- Response helpers ----

export const contributionResponse = z.object({
  id: uuidSchema,
  claim_id: uuidSchema,
  contributor_id: uuidSchema,
  contribution_type: z.string(),
  content: z.string(),
  evidence_urls: z.array(z.string()),
  submitted_at: z.string(),
  review_status: z.string(),
  merge_target_claim_id: uuidSchema.nullable(),
  proposed_canonical_form: z.string().nullable(),
});

export const reviewResponse = z.object({
  id: uuidSchema,
  decision: z.string(),
  reasoning: z.string(),
  confidence: z.number(),
  policy_citations: z.array(z.string()),
  reviewed_at: z.string(),
  reviewed_by: z.string(),
});

export const appealResponse = z.object({
  id: uuidSchema,
  contribution_id: uuidSchema,
  original_review_id: uuidSchema,
  appellant_id: uuidSchema,
  appeal_reasoning: z.string(),
  submitted_at: z.string(),
  status: z.string(),
});

export const arbitrationResponse = z.object({
  id: uuidSchema,
  contribution_id: uuidSchema,
  appeal_id: uuidSchema.nullable(),
  outcome: z.string(),
  decision: z.string(),
  reasoning: z.string(),
  consensus_achieved: z.boolean().nullable(),
  human_review_recommended: z.boolean(),
  arbitrated_at: z.string(),
  arbitrated_by: z.string(),
});
