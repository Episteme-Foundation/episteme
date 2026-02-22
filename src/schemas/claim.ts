import { z } from "zod";
import {
  uuidSchema,
  claimTypeEnum,
  claimStateEnum,
  assessmentStatusEnum,
  informationDepthEnum,
  stanceEnum,
} from "./common.js";

// ---- Request schemas ----

export const claimSearchParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  min_similarity: z.coerce.number().min(0).max(1).default(0.3),
});

export const claimGetParams = z.object({
  information_depth: informationDepthEnum.default("standard"),
});

export const claimProposeBody = z.object({
  claim: z.string().min(1).max(2000),
  argument: z.string().min(1).max(5000),
});

export const claimPatchBody = z.object({
  argument: z.object({
    stance: stanceEnum,
    content: z.string().min(1).max(5000),
    evidence_urls: z.array(z.string().url()).optional(),
  }),
});

// ---- Response schemas ----

export const claimResponse = z.object({
  id: uuidSchema,
  text: z.string(),
  claim_type: claimTypeEnum,
  state: claimStateEnum,
  decomposition_status: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const assessmentResponse = z.object({
  id: uuidSchema,
  status: assessmentStatusEnum,
  confidence: z.number(),
  reasoning_trace: z.string(),
  subclaim_summary: z.record(z.unknown()),
  assessed_at: z.string(),
});

export const searchResultItem = z.object({
  id: uuidSchema,
  text: z.string(),
  claim_type: z.string(),
  state: z.string(),
  similarity_score: z.number(),
  assessment_status: assessmentStatusEnum.nullable(),
  assessment_confidence: z.number().nullable(),
});

export const searchResponse = z.object({
  results: z.array(searchResultItem),
  total: z.number(),
});

export const treeNodeResponse: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: uuidSchema,
    text: z.string(),
    claim_type: z.string(),
    state: z.string(),
    depth: z.number(),
    relation_type: z.string().nullable(),
    reasoning: z.string().nullable(),
    confidence: z.number().nullable(),
    assessment_status: assessmentStatusEnum.nullable(),
    assessment_confidence: z.number().nullable(),
    children: z.array(treeNodeResponse),
  })
);

export interface TreeNode {
  id: string;
  text: string;
  claim_type: string;
  state: string;
  depth: number;
  relation_type: string | null;
  reasoning: string | null;
  confidence: number | null;
  assessment_status: string | null;
  assessment_confidence: number | null;
  children: TreeNode[];
}

export const claimDetailResponse = z.object({
  claim: claimResponse,
  assessment: assessmentResponse.nullable(),
  subclaim_count: z.number(),
  tree: treeNodeResponse.optional(),
  arguments: z
    .array(
      z.object({
        id: uuidSchema,
        stance: stanceEnum,
        content: z.string(),
        evidence_urls: z.array(z.string()),
        created_by: z.string(),
        created_at: z.string(),
      })
    )
    .optional(),
  instances: z
    .array(
      z.object({
        id: uuidSchema,
        source_id: uuidSchema,
        original_text: z.string(),
        context: z.string().nullable(),
        confidence: z.number(),
        source_title: z.string(),
        source_url: z.string().nullable(),
      })
    )
    .optional(),
});

export const claimProposeResponse = z.object({
  claim: claimResponse,
  argument: z.object({
    id: uuidSchema,
    stance: stanceEnum,
    content: z.string(),
    created_by: z.string(),
    created_at: z.string(),
  }),
  job_id: uuidSchema,
});
