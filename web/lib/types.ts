// Mirrors the Episteme API (src/schemas/*). Kept hand-written for now; will be
// replaced by a client generated from the Fastify OpenAPI spec.

export type AssessmentStatus =
  | "verified" | "supported" | "contested"
  | "unsupported" | "contradicted" | "unknown";

export type ClaimType =
  | "empirical_verifiable" | "empirical_derived" | "definitional"
  | "evaluative" | "causal" | "normative";

export type ClaimState =
  | "active" | "merged" | "deprecated" | "archived";

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
  // The argument's written form (issue #129): brief prose with inline
  // [[claim:<uuid>]] references stating how the grouped subclaims combine to
  // bear on the claim. Optional while API deploys race the frontend.
  argument_content?: string | null;
  children: TreeNode[];
  // A repeated occurrence of a shared subclaim: its children are rendered at
  // the node's first occurrence in the response, not duplicated here.
  subtree_collapsed?: boolean;
  // The API's node cap dropped some of this node's children.
  children_truncated?: boolean;
}

export interface Assessment {
  id: string;
  status: AssessmentStatus;
  // Verdict confidence: how sure the Steward is that `status` is the right
  // reading of the evidence. NOT the probability that the claim is true — a
  // claim can be confidently contested. Render it quietly and labelled.
  confidence: number;
  // Credence: the Steward's probability that the claim, as stated, is true.
  // Null where one number would be false precision (normative/evaluative
  // claims, entangled composites) — constitution §7. Optional while API
  // deploys race the frontend.
  claim_credence?: number | null;
  // Reader-facing body shown front-and-centre. The API falls back to
  // reasoning_trace for assessments written before the summary/reasoning split,
  // so this is always populated.
  summary: string;
  reasoning_trace: string;
  // DEPRECATED (#160): nothing in the pipeline ever computes this — the column
  // defaults to {} and reassessment carries the empty value forward. Do not
  // render it; the decomposition compass derives the real breakdown from the
  // tree. Kept in the type because the API still returns the field.
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
  // The Extractor's confidence that the passage states a genuine, well-formed
  // claim (see src/workers/url-extraction.ts). NOT the Matcher's match
  // confidence, which is currently not persisted on the instance.
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

// --- claim event history (#175) ----------------------------------------------

// One entry in a claim's unified history: assessments, contributions, the
// decisions made about them, and steward notes, merged newest-first by the
// API's GET /claims/:id/events. A flat discriminated union — decisions come in
// several forms from several parties, and new kinds should be renderable
// without restructuring.
export type ClaimEvent =
  | { kind: "created"; id: string; at: string; actor: string }
  | {
      kind: "assessment";
      id: string;
      at: string;
      actor: string;
      assessment_id: string;
      status: AssessmentStatus;
      confidence: number;
      claim_credence: number | null;
      summary: string;
      trigger: string | null;
      trigger_context: string | null;
      is_current: boolean;
      prev_status: AssessmentStatus | null;
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

export interface ClaimEventsPage {
  events: ClaimEvent[];
  total: number;
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
    // Null for intake proposals (propose_claim / propose_source) still
    // awaiting review (#157).
    claim_id: string | null;
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

// The public record of one contribution and its review (#174): what was
// submitted, and — once the reviewer has decided — the decision with the
// reasoning that justifies it.
export interface ContributionDetail {
  contribution: {
    id: string;
    claim_id: string | null;
    contributor_id: string;
    contribution_type: string;
    content: string;
    evidence_urls: string[];
    submitted_at: string;
    review_status: string;
    merge_target_claim_id: string | null;
    proposed_canonical_form: string | null;
  };
  review: {
    id: string;
    decision: string;
    reasoning: string;
    confidence: number;
    policy_citations: string[];
    reviewed_at: string;
    reviewed_by: string;
  } | null;
}
