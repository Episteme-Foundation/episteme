import { completeStructured } from "../client.js";
import { getMatcherSystemPrompt, getMatchingPrompt } from "../prompts/matcher.js";

export interface MatchDecision {
  is_match: boolean;
  matched_claim_id: string | null;
  new_canonical_form: string | null;
  /**
   * Whether this source asserts the claim as canonically stated ("affirms") or
   * asserts its negation/contrary ("denies"). Lets a claim and its denial share
   * one canonical node while preserving which side each source takes.
   */
  instance_stance: "affirms" | "denies";
  confidence: number;
  reasoning: string;
  alternative_matches: string[];
  relationship_notes: string | null;
}

const MATCH_DECISION_SCHEMA = {
  type: "object" as const,
  properties: {
    is_match: { type: "boolean", description: "Whether the claim matches an existing claim (including its negation/counterpart)" },
    matched_claim_id: { type: ["string", "null"], description: "ID of the matched claim if is_match is True" },
    new_canonical_form: { type: ["string", "null"], description: "Proposed canonical form if is_match is False" },
    instance_stance: { type: "string", enum: ["affirms", "denies"], description: "Whether this source asserts the canonical claim (affirms) or its negation/contrary (denies)" },
    confidence: { type: "number", description: "Confidence in the matching decision (0.0-1.0)" },
    reasoning: { type: "string", description: "Detailed explanation of the decision" },
    alternative_matches: { type: "array", items: { type: "string" }, description: "IDs of other claims considered" },
    relationship_notes: { type: ["string", "null"], description: "Notes on relationships to other claims" },
  },
  required: ["is_match", "confidence", "reasoning", "instance_stance"],
};

export async function matchClaim(input: {
  extractedText: string;
  proposedCanonical: string;
  candidates: Array<{ id: string; canonical_form: string; score: number }>;
  model?: string;
}): Promise<MatchDecision> {
  const userPrompt = getMatchingPrompt(
    input.extractedText,
    input.proposedCanonical,
    input.candidates
  );

  return completeStructured<MatchDecision>({
    messages: [{ role: "user", content: userPrompt }],
    schema: MATCH_DECISION_SCHEMA,
    schemaName: "MatchDecision",
    system: getMatcherSystemPrompt(),
    model: input.model,
  });
}
