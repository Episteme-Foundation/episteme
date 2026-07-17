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

export const assessedFilterEnum = z.enum(["all", "assessed", "unassessed"]);

export const claimSearchParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  min_similarity: z.coerce.number().min(0).max(1).default(0.3),
  assessed: assessedFilterEnum.default("all"),
  min_importance: z.coerce.number().min(0).max(1).default(0),
});

// Browse-feed filters share the assessment/importance levers with search.
export const claimListParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
  state: z.string().optional(),
  assessed: assessedFilterEnum.default("all"),
  min_importance: z.coerce.number().min(0).max(1).default(0),
});

export const claimGetParams = z.object({
  information_depth: informationDepthEnum.default("standard"),
  // Optional cap on how deep the decomposition tree is fetched (default 5).
  // The claim map renders three rings per view, so it asks for less.
  depth: z.coerce.number().int().min(1).max(5).optional(),
});

// GET /claims/:id/dependents (issue #102) — reverse decomposition edges,
// paginated because hub claims can have hundreds of dependents while consumers
// typically show a handful plus a count.
export const claimDependentsParams = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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
  // Verdict confidence — how sure the Steward is of the status, not P(true).
  confidence: z.number(),
  // Credence that the claim is true; null where one number would be false
  // precision (constitution §7). Optional so pre-deploy responses still parse.
  claim_credence: z.number().nullable().optional(),
  summary: z.string(),
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
    argument_id: uuidSchema.nullable(),
    argument_name: z.string().nullable(),
    argument_stance: stanceEnum.nullable(),
    // The argument's written form (issue #129): brief prose with inline
    // [[claim:<uuid>]] references, stating how the grouped subclaims combine.
    argument_content: z.string().nullable(),
    children: z.array(treeNodeResponse),
    // Set (true) only on a repeated occurrence of a shared subclaim: the graph
    // is a DAG, and the node's children are rendered at its first occurrence
    // in this response rather than duplicated here.
    subtree_collapsed: z.boolean().optional(),
    // Set (true) only when the response's node cap dropped some of this
    // node's children — the tree is bounded, never silently complete-looking.
    children_truncated: z.boolean().optional(),
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
  argument_id: string | null;
  argument_name: string | null;
  argument_stance: string | null;
  argument_content: string | null;
  children: TreeNode[];
  subtree_collapsed?: boolean;
  children_truncated?: boolean;
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

// ---- Assessment history / trajectory schemas ----

export const assessmentHistoryParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

export const assessmentHistoryItem = z.object({
  id: uuidSchema,
  claim_id: uuidSchema,
  status: assessmentStatusEnum,
  confidence: z.number(),
  claim_credence: z.number().nullable().optional(),
  summary: z.string(),
  reasoning_trace: z.string(),
  is_current: z.boolean(),
  subclaim_summary: z.record(z.unknown()),
  trigger: z.string().nullable(),
  trigger_context: z.string().nullable(),
  assessed_at: z.string(),
});

export const assessmentHistoryResponse = z.object({
  assessments: z.array(assessmentHistoryItem),
  total: z.number(),
});

export const trajectoryPoint = z.object({
  status: assessmentStatusEnum,
  confidence: z.number(),
  assessed_at: z.string(),
  is_current: z.boolean(),
  trigger: z.string().nullable(),
});

export const assessmentTrajectoryResponse = z.object({
  current: trajectoryPoint.nullable(),
  history: z.array(trajectoryPoint),
  total_assessments: z.number(),
  status_transitions: z.number(),
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
