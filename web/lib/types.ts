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

// Mirrors the backend sourceTypeEnum (src/schemas/common.ts).
export type SourceType =
  | "primary_data" | "peer_reviewed" | "government" | "news_original"
  | "news_secondary" | "opinion" | "social_media" | "unknown";

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
  // How load-bearing the claim is (0..1), set by the Steward. Orders the work
  // queue: important claims are assessed and decomposed first under a budget.
  importance: number;
  // Steward work-queue lifecycle: pending → running → done | error. A claim that
  // has never reached "done" (and has no assessment) is an unprocessed stub, not
  // an irreducible atom.
  steward_state?: string;
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
  source_type?: SourceType;
}

export interface TrajectoryPoint {
  status: AssessmentStatus;
  confidence: number;
  assessed_at: string;
  is_current: boolean;
  trigger: string | null;
}

// A claim that depends on THIS claim — a reverse decomposition edge. `relation_type`
// describes how the dependent uses this claim (e.g. it `requires` it as a premise).
// This is the data that fills the right margin on a claim page.
export interface DependentClaim {
  id: string;
  text: string;
  claim_type: ClaimType;
  relation_type: RelationType;
  assessment_status: AssessmentStatus | null;
  assessment_confidence: number | null;
}

export interface ClaimDetail {
  claim: ClaimCore;
  assessment: Assessment | null;
  subclaim_count: number;
  tree?: TreeNode;
  arguments?: ArgumentItem[];
  instances?: Instance[];
  dependents?: DependentClaim[];
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
  similarity_score?: number; // search results only; absent in the browse feed
  importance?: number;
  assessment_status: AssessmentStatus | null;
  assessment_confidence: number | null;
}

export type AssessedFilter = "all" | "assessed" | "unassessed";

// The browse/search filter levers, threaded from the URL through to the API.
export interface ClaimFilters {
  assessed?: AssessedFilter;
  minImportance?: number;
}

// --- contributors (#71) ------------------------------------------------------

export interface LeaderboardContributor {
  id: string;
  display_name: string;
  avatar_url: string | null;
  kudos: number;
  reputation_score: number;
  trust_level: string;
  contributions_accepted: number;
  member_since: string;
}

export interface ContributorProfile {
  contributor: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    member_since: string;
    reputation_score: number;
    trust_level: string;
    kudos: number;
    contribution_standing: string;
    is_verified: boolean;
    is_suspended: boolean;
    contributions_accepted: number;
    contributions_rejected: number;
    contributions_escalated: number;
    total_contributions: number;
    acceptance_rate: number | null;
  };
  recent_contributions: Array<{
    id: string;
    claim_id: string;
    contribution_type: string;
    review_status: string;
    submitted_at: string;
  }>;
  recent_kudos: Array<{
    id: string;
    contribution_id: string | null;
    amount: number;
    reason: string;
    awarded_by: string;
    created_at: string;
  }>;
}
