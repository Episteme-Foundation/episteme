"""Prompts for the Matcher agent.

The Matcher determines whether an extracted claim matches an existing
canonical form in the knowledge graph or should be created as a new claim.
"""

from episteme.llm.prompts.constitution import build_admin_prompt


class MatcherPrompts:
    """Prompt templates for the Matcher agent."""

    ROLE_PROMPT = """# Your Role: Claim Matcher

You are a Claim Matcher for the Episteme knowledge graph. Your task is to
determine whether a newly extracted claim matches an existing claim in the
graph or should be created as a new claim.

## The Matching Principle

From the Constitution: "Two claims are the same if and only if they decompose
identically."

This means two formulations represent the same claim when:
- They would have the same truth conditions
- They make the same implicit assumptions
- They would decompose into the same subclaims
- Accepting one rationally commits you to the other

## What Makes Claims DIFFERENT?

Claims that sound similar may be different if:
- They have different implicit parameters (time, place, measure, threshold)
- They make different assumptions about definitions
- One is more specific than the other (specification, not identity)
- They have different truth conditions

Example: "Inflation was high in 2022" vs "Inflation exceeded 5% in 2022"
These are DIFFERENT claims because one uses "high" (requires a definitional
subclaim about what counts as high) while the other uses a specific threshold.

## What Makes Claims THE SAME?

Claims are the same if:
- They express the same proposition in different words
- The canonical forms would be identical
- They would decompose into exactly the same subclaims

Example: "The Earth is roughly 4.5 billion years old" vs "Earth's age is
approximately 4.5 billion years"
These are THE SAME claim - identical truth conditions, same decomposition.

## Your Task

Given an extracted claim and a list of candidate matches from vector search,
determine:

1. **Does it match an existing claim?** If yes, which one and why.
2. **Is it a new claim?** If yes, what should its canonical form be.
3. **Is it a specification/generalization?** Note relationships even if not identical.

## Decision Criteria

When matching:
- Prioritize semantic equivalence over surface similarity
- Consider what subclaims each formulation would generate
- Be conservative: if unsure, create a new claim (relationships can be added)
- Note alternative matches for human review

When creating new:
- Propose a canonical form following constitution guidelines
- Make all parameters explicit
- Preserve original meaning faithfully

## Output

Provide your decision with:
- The matched claim ID (if matching)
- The proposed canonical form (if new)
- Confidence score (0.0-1.0)
- Detailed reasoning explaining your decision
- Alternative matches considered (if any)
"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """Get the full system prompt with constitution."""
        return build_admin_prompt(cls.ROLE_PROMPT)

    @classmethod
    def get_matching_prompt(
        cls,
        extracted_text: str,
        proposed_canonical: str,
        candidates: list[dict],
    ) -> str:
        """Get the user prompt for matching a claim.

        Args:
            extracted_text: The original extracted text
            proposed_canonical: The proposed canonical form from extractor
            candidates: List of candidate matches with {id, canonical_form, score}

        Returns:
            User prompt for matching
        """
        prompt = f"""Please determine whether this extracted claim matches an existing claim.

## Extracted Claim

Original text: "{extracted_text}"

Proposed canonical form: "{proposed_canonical}"

## Candidate Matches from Knowledge Graph

"""
        if candidates:
            for i, candidate in enumerate(candidates, 1):
                prompt += f"""{i}. ID: {candidate['id']}
   Canonical form: "{candidate['canonical_form']}"
   Similarity score: {candidate['score']:.3f}

"""
        else:
            prompt += "(No similar claims found in the knowledge graph)\n\n"

        prompt += """## Your Task

Determine:
1. Does this claim match any of the candidates? If so, which one and why?
2. If no match, what should the canonical form be for the new claim?
3. Are any candidates related but not identical (specifications, generalizations)?

Provide your decision with full reasoning.
"""
        return prompt

    @classmethod
    def get_disambiguation_prompt(
        cls,
        extracted_text: str,
        context: str,
        ambiguous_aspects: list[str],
    ) -> str:
        """Get a prompt for disambiguating an ambiguous claim.

        Args:
            extracted_text: The original extracted text
            context: Surrounding context from the document
            ambiguous_aspects: What aspects are ambiguous

        Returns:
            User prompt for disambiguation
        """
        prompt = f"""This extracted claim has ambiguous aspects that need clarification.

## Extracted Claim

Original text: "{extracted_text}"

Context: "{context}"

## Ambiguous Aspects

"""
        for aspect in ambiguous_aspects:
            prompt += f"- {aspect}\n"

        prompt += """
## Your Task

Based on the context provided:
1. Can any ambiguities be resolved from context?
2. For unresolvable ambiguities, should we:
   a) Create a claim with explicit placeholders?
   b) Create multiple claims for different interpretations?
   c) Flag for human review?

Provide your recommendation with reasoning.
"""
        return prompt

    @classmethod
    def get_merge_evaluation_prompt(
        cls,
        claim_a: dict,
        claim_b: dict,
    ) -> str:
        """Get a prompt for evaluating whether two claims should be merged.

        Args:
            claim_a: First claim {id, canonical_form}
            claim_b: Second claim {id, canonical_form}

        Returns:
            User prompt for merge evaluation
        """
        return f"""Please evaluate whether these two claims should be merged.

## Claim A
ID: {claim_a['id']}
Canonical form: "{claim_a['canonical_form']}"

## Claim B
ID: {claim_b['id']}
Canonical form: "{claim_b['canonical_form']}"

## Evaluation Criteria

From the Constitution: "Two claims are the same if and only if they decompose
identically."

Consider:
1. Do they have the same truth conditions?
2. Would they decompose into the same subclaims?
3. Are there any parameters that differ?
4. Is one a specification of the other?

## Your Task

Determine:
1. Should these claims be merged? (Yes/No)
2. If yes, what should the merged canonical form be?
3. If no, what relationship (if any) exists between them?

Provide detailed reasoning for your decision.
"""
