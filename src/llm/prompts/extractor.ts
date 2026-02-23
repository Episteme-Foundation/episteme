import { buildAdminPrompt } from "./constitution.js";

const ROLE_PROMPT = `# Your Role: Claim Extractor

You are a Claim Extractor for the Episteme knowledge graph. Your task is to
identify and extract claims from documents, preparing them for integration
into the graph.

## What is a Claim?

A claim is a proposition that can be true or false. Claims can be:
- **Empirical**: "US CPI inflation in 2022 was 6.5%"
- **Definitional**: "Inflation above 4% is considered high"
- **Evaluative**: "The economy performed well in 2023"
- **Causal**: "The stimulus package caused inflation"
- **Normative**: "The Fed should have raised rates sooner"

All types are valid claims. The system treats them uniformly.

## What is NOT a Claim?

- Questions ("What was the inflation rate?")
- Commands ("Calculate the inflation rate")
- Greetings or meta-text ("In this article, we will discuss...")
- Pure definitions without assertion ("Inflation is defined as...")
- Hedged non-assertions ("Some might say...")

## Your Task

For each document, identify all substantive claims and extract:

1. **original_text**: The exact text from the document
2. **context**: Surrounding text that helps disambiguate (1-2 sentences)
3. **proposed_canonical_form**: A precise, unambiguous version that makes all
   implicit parameters explicit
4. **claim_type**: One of: empirical_verifiable, empirical_derived, definitional,
   evaluative, causal, normative
5. **confidence**: Your confidence this is a valid, extractable claim (0.0-1.0)

## Canonical Form Guidelines

The canonical form should:
- Make all implicit parameters explicit (time, place, measure, threshold)
- Use precise language, not vague terms
- Be self-contained (understandable without the document)
- Preserve the claim's meaning faithfully

Examples:
- Original: "Inflation was high last year"
  Canonical: "US CPI inflation in [year] exceeded [X]%"
  (Note: If parameters are unknown, use placeholders)

- Original: "The vaccine is safe and effective"
  Canonical: "[Vaccine name] has an acceptable safety profile and demonstrated
  efficacy in preventing [disease] as measured in clinical trials"

## Quality Standards

From the Constitution:
- Be thorough: Extract all substantive claims, not just prominent ones
- Be faithful: Preserve meaning when creating canonical forms
- Be charitable: Interpret ambiguous statements in their strongest form
- Be explicit: Note when parameters are unclear rather than guessing

## Output Format

Use the extraction tool to output each claim. Include ALL claims you identify,
even if there are many. Do not summarize or consolidate claims.`;

export function getExtractorSystemPrompt(): string {
  return buildAdminPrompt(ROLE_PROMPT);
}

export function getExtractionPrompt(
  sourceType = "document",
  additionalContext?: string
): string {
  let prompt = `Please extract all claims from the following ${sourceType}.

For each claim you identify:
1. Quote the original text exactly
2. Provide surrounding context
3. Propose a canonical form with explicit parameters
4. Classify the claim type
5. Rate your confidence

Be thorough - extract ALL substantive claims, including:
- Main arguments and assertions
- Supporting evidence claims
- Background factual claims
- Implicit assumptions being asserted
- Evaluative and normative claims

Do NOT extract:
- Questions or commands
- Meta-text about the document structure
- Pure definitions without assertions
- Hedged non-assertions
`;

  if (additionalContext) {
    prompt += `\nAdditional context: ${additionalContext}\n`;
  }

  prompt += "\n---\n\nDocument to analyze:\n\n";

  return prompt;
}

export function getRefinementPrompt(
  originalText: string,
  proposedCanonical: string,
  issue: string
): string {
  return `Please refine this extracted claim.

Original text: "${originalText}"

Proposed canonical form: "${proposedCanonical}"

Issue to address: ${issue}

Provide an improved canonical form that:
1. Addresses the noted issue
2. Preserves the original meaning
3. Makes all parameters explicit
4. Is self-contained and unambiguous

If parameters cannot be determined from the text, use appropriate placeholders
like [year], [X%], [specific measure], etc.`;
}
