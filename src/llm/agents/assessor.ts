import { completeStructured } from "../client.js";
import {
  getAssessorSystemPrompt,
  getAssessmentPrompt,
  getAtomicAssessmentPrompt,
} from "../prompts/assessor.js";

export interface AssessmentResult {
  status: string;
  confidence: number;
  reasoning_trace: string;
  evidence_for: string[];
  evidence_against: string[];
  subclaim_summary: Record<string, number>;
  requires_more_evidence: boolean;
}

const ASSESSMENT_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    status: {
      type: "string",
      enum: ["verified", "supported", "contested", "unsupported", "contradicted", "unknown"],
      description: "One of: verified, supported, contested, unsupported, contradicted, unknown",
    },
    confidence: { type: "number", description: "Confidence in this assessment (0.0-1.0)" },
    reasoning_trace: { type: "string", description: "Detailed explanation of how this assessment was reached" },
    evidence_for: { type: "array", items: { type: "string" }, description: "UUIDs of claims supporting this claim" },
    evidence_against: { type: "array", items: { type: "string" }, description: "UUIDs of claims contradicting this claim" },
    subclaim_summary: { type: "object", description: "Count of subclaims by status" },
    requires_more_evidence: { type: "boolean", description: "Whether more evidence is needed" },
  },
  required: ["status", "confidence", "reasoning_trace"],
};

/**
 * Assess a compound claim based on its subclaim assessments.
 */
export async function assessClaim(input: {
  claimText: string;
  claimType: string;
  subclaims: Array<{
    canonical_form: string;
    relation: string;
    status: string;
    confidence: number;
    reasoning: string;
  }>;
  model?: string;
}): Promise<AssessmentResult> {
  const userPrompt = getAssessmentPrompt(
    input.claimText,
    input.claimType,
    input.subclaims
  );

  return completeStructured<AssessmentResult>({
    messages: [{ role: "user", content: userPrompt }],
    schema: ASSESSMENT_RESPONSE_SCHEMA,
    schemaName: "AssessmentResponse",
    system: getAssessorSystemPrompt(),
    model: input.model,
  });
}

/**
 * Assess an atomic claim (leaf node with no subclaims).
 */
export async function assessAtomicClaim(input: {
  claimText: string;
  claimType: string;
  atomicType: string | null;
  instances?: Array<{
    source_title: string;
    source_type: string;
    original_text: string;
    confidence: number;
  }>;
  model?: string;
}): Promise<AssessmentResult> {
  const userPrompt = getAtomicAssessmentPrompt(
    input.claimText,
    input.claimType,
    input.atomicType,
    input.instances
  );

  return completeStructured<AssessmentResult>({
    messages: [{ role: "user", content: userPrompt }],
    schema: ASSESSMENT_RESPONSE_SCHEMA,
    schemaName: "AssessmentResponse",
    system: getAssessorSystemPrompt(),
    model: input.model,
  });
}

/**
 * Compute a heuristic fallback assessment when LLM is unavailable.
 *
 * This is a simplified heuristic -- the real assessment comes from the LLM.
 * The fallback provides a reasonable default based on subclaim status counts
 * and relationships, covering all 6 statuses.
 */
export function computeFallbackAssessment(
  subclaims: Array<{
    relation: string;
    status: string;
    confidence: number;
  }>
): AssessmentResult {
  const statusCounts: Record<string, number> = {
    verified: 0,
    supported: 0,
    contested: 0,
    unsupported: 0,
    contradicted: 0,
    unknown: 0,
  };
  let minConfidence = 1.0;
  let hasContradicted = false;
  let hasContested = false;
  let hasUnsupported = false;
  let allVerifiedOrSupported = true;

  for (const sc of subclaims) {
    const status = sc.status.toLowerCase();
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    minConfidence = Math.min(minConfidence, sc.confidence);

    if (status === "contradicted") hasContradicted = true;
    if (status === "contested") hasContested = true;
    if (status === "unsupported") hasUnsupported = true;
    if (status !== "verified" && status !== "supported") {
      allVerifiedOrSupported = false;
    }
  }

  let status: string;
  if (subclaims.length === 0) {
    status = "unknown";
  } else if (hasContradicted) {
    // If any subclaim is actively contradicted, this is at minimum contested
    status = "contested";
  } else if (hasContested) {
    status = "contested";
  } else if (hasUnsupported) {
    status = "unsupported";
  } else if (allVerifiedOrSupported) {
    // If everything is verified or supported, lean toward supported
    // (only LLM judgment can fully verify)
    const allVerified = statusCounts.verified === subclaims.length;
    status = allVerified ? "verified" : "supported";
  } else {
    status = "unknown";
  }

  return {
    status,
    confidence: minConfidence * 0.9,
    reasoning_trace: "Fallback heuristic assessment based on subclaim status counts",
    evidence_for: [],
    evidence_against: [],
    subclaim_summary: statusCounts,
    requires_more_evidence: false,
  };
}
