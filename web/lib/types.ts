// Mirrors the Episteme API (src/schemas/*). Kept hand-written for now; will be
// replaced by a client generated from the Fastify OpenAPI spec.

export type AssessmentStatus =
  | "verified" | "supported" | "contested"
  | "unsupported" | "contradicted" | "unknown";

export type ClaimType =
  | "empirical_verifiable" | "empirical_derived" | "definitional"
  | "evaluative" | "causal" | "normative";

export type ClaimState =
  | "active" | "under_review" | "contested" | "merged" | "deprecated";

export type Stance = "for" | "against" | "neutral";

export type RelationType =
  | "requires" | "supports" | "contradicts"
  | "specifies" | "defines" | "presupposes";

export interface TreeNode {
  id: string;
  text: string;
  claim_type: ClaimType;
  state: ClaimState;
  depth: number;
  relation_type: RelationType | null;
  reasoning: string | null;
  confidence: number | null;
  assessment_status: AssessmentStatus | null;
  assessment_confidence: number | null;
  argument_id: string | null;
  argument_name: string | null;
  argument_stance: Stance | null;
  children: TreeNode[];
}

export interface Assessment {
  id: string;
  status: AssessmentStatus;
  confidence: number;
  reasoning_trace: string;
  subclaim_summary: Record<string, number>;
  assessed_at: string;
}

export interface ClaimCore {
  id: string;
  text: string;
  claim_type: ClaimType;
  state: ClaimState;
  decomposition_status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ArgumentItem {
  id: string;
  name?: string | null;
  stance: Stance;
  content: string;
  evidence_urls: string[];
  created_by: string;
  created_at: string;
}

export interface Instance {
  id: string;
  source_id: string;
  original_text: string;
  context: string | null;
  confidence: number;
  source_title: string;
  source_url: string | null;
  source_type?: string;
}

export interface TrajectoryPoint {
  status: AssessmentStatus;
  confidence: number;
  assessed_at: string;
  is_current: boolean;
  trigger: string | null;
}

export interface ClaimDetail {
  claim: ClaimCore;
  assessment: Assessment | null;
  subclaim_count: number;
  tree?: TreeNode;
  arguments?: ArgumentItem[];
  instances?: Instance[];
  trajectory?: {
    current: TrajectoryPoint | null;
    history: TrajectoryPoint[];
    total_assessments: number;
    status_transitions: number;
  };
}

export interface SearchResultItem {
  id: string;
  text: string;
  claim_type: ClaimType;
  state: ClaimState;
  // Present for search results (relevance score); absent for the browse feed,
  // which is ordered by recency rather than similarity.
  similarity_score?: number;
  assessment_status: AssessmentStatus | null;
  assessment_confidence: number | null;
}
