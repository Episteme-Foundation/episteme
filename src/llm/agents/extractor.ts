import { completeStructuredList } from "../client.js";
import {
  getExtractorSystemPrompt,
  getExtractionPrompt,
} from "../prompts/extractor.js";

export interface ExtractedClaim {
  original_text: string;
  context: string | null;
  proposed_canonical_form: string;
  claim_type: string;
  confidence: number;
  source_location: string | null;
}

const EXTRACTED_CLAIM_SCHEMA = {
  type: "object" as const,
  properties: {
    original_text: { type: "string", description: "The exact text from the document" },
    context: { type: ["string", "null"], description: "Surrounding text for disambiguation" },
    proposed_canonical_form: { type: "string", description: "Precise, unambiguous version with explicit parameters" },
    claim_type: { type: "string", description: "One of: empirical_verifiable, empirical_derived, definitional, evaluative, causal, normative" },
    confidence: { type: "number", description: "Confidence this is a valid claim (0.0-1.0)" },
    source_location: { type: ["string", "null"], description: "Where in the document this was found" },
  },
  required: ["original_text", "proposed_canonical_form", "claim_type", "confidence"],
};

export async function extractClaims(input: {
  content: string;
  sourceType?: string;
  additionalContext?: string;
  model?: string;
}): Promise<ExtractedClaim[]> {
  const userPrompt =
    getExtractionPrompt(input.sourceType, input.additionalContext) +
    input.content;

  return completeStructuredList<ExtractedClaim>({
    messages: [{ role: "user", content: userPrompt }],
    itemSchema: EXTRACTED_CLAIM_SCHEMA,
    schemaName: "ExtractedClaim",
    system: getExtractorSystemPrompt(),
    model: input.model,
    maxTokens: 8192,
  });
}
