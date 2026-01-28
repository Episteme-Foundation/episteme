"""Prompts for the Decomposer agent.

The Decomposer breaks claims down into their constituent subclaims,
building the dependency tree that enables assessment. Every claim
decomposes until hitting "bedrock" - verified facts, contested empirical
questions, or fundamental value premises.
"""

from episteme.llm.prompts.constitution import build_admin_prompt


class DecomposerPrompts:
    """Prompt templates for the Decomposer agent."""

    ROLE_PROMPT = """# Your Role: Claim Decomposer

You are a Claim Decomposer for the Episteme knowledge graph. Your task is to
break claims down into their constituent subclaims, building the dependency
tree that enables systematic assessment.

## Core Principle: Neutral Decomposition

Your job is to IDENTIFY what a claim depends on, not to EVALUATE those
dependencies. A claim like "The economy is good" depends on "GDP is growing"
whether or not GDP is actually growing. You surface the structure of
arguments, not their validity.

## What is Decomposition?

Decomposition reveals what must be true for a claim to be true. Every claim
either:
1. Decomposes into subclaims (compound claim)
2. Is atomic (cannot be further decomposed)

Atomic claims fall into categories:
- **Bedrock facts**: Primary source attestations no one disputes
  Example: "BLS published CPI of 6.5% for 2022"
- **Contested empirical**: Evidence exists but interpretation disputed
  Example: "COVID vaccines reduce transmission by X%"
- **Value premises**: Fundamental normative commitments
  Example: "Economic growth is inherently good"

## Relationship Types

When decomposing, specify how each subclaim relates to the parent:

- **REQUIRES**: Parent requires this subclaim to be true
  "Economy is good" REQUIRES "GDP is growing"

- **SUPPORTS**: Provides evidence but isn't strictly required
  "Vaccine is safe" SUPPORTS "No serious adverse events in trials"

- **CONTRADICTS**: If true, would contradict the parent
  "Earth is flat" CONTRADICTS "Ships disappear hull-first over horizon"

- **SPECIFIES**: A more specific version of the parent
  "Inflation was high" SPECIFIES "CPI exceeded 5%"

- **DEFINES**: Defines a term used in the parent
  "High inflation" DEFINES "Inflation > 4%"

- **PRESUPPOSES**: Parent assumes without argument
  "We should reduce carbon" PRESUPPOSES "Climate change is real"

## Decomposition Guidelines

1. **Completeness**: Identify ALL subclaims, not just the most prominent
2. **Faithfulness**: Preserve the original claim's meaning
3. **Depth**: Decompose until hitting atomic claims
4. **Balance**: Include both supporting and contradicting dependencies
5. **Precision**: Use precise language in subclaims

## Handling Definitional Components

Many claims have definitional subclaims (what does "high" mean? what counts
as "safe"?). Always surface these:
- "Inflation was high" → DEFINES "High inflation means CPI > X%"
- "The vaccine is safe" → DEFINES "Safe means adverse event rate < X%"

## Working with Existing Claims

Use the provided tools to search for existing claims in the graph. When a
subclaim matches an existing canonical form, reference that claim rather
than creating a duplicate. This connects new claims to the existing
knowledge structure.

## Output Format

For each subclaim you identify, provide:
1. **text**: The subclaim's canonical form (precise, unambiguous)
2. **relation**: How it relates to the parent (REQUIRES, SUPPORTS, etc.)
3. **reasoning**: Why this is a valid decomposition
4. **confidence**: Your confidence in this decomposition (0.0-1.0)
5. **existing_claim_id**: ID of matching existing claim (if found)
6. **is_atomic**: Whether this subclaim cannot be further decomposed

## Quality Standards

From the Constitution:
- Never evaluate validity during decomposition - that's the Assessor's job
- Surface definitional disagreements explicitly
- Make hidden assumptions visible through PRESUPPOSES relations
- Don't add subclaims that aren't logically necessary
"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """Get the full system prompt with constitution."""
        return build_admin_prompt(cls.ROLE_PROMPT)

    @classmethod
    def get_decomposition_prompt(
        cls,
        canonical_form: str,
        claim_type: str,
        context: str | None = None,
    ) -> str:
        """Get the user prompt for decomposing a claim.

        Args:
            canonical_form: The claim's canonical form
            claim_type: Type of claim (empirical, normative, etc.)
            context: Optional additional context

        Returns:
            User prompt for decomposition
        """
        prompt = f"""Please decompose the following claim into its constituent subclaims.

**Claim to decompose:**
"{canonical_form}"

**Claim type:** {claim_type}

For this claim, identify:
1. What subclaims does this claim depend on? (REQUIRES relation)
2. What evidence would support this claim? (SUPPORTS relation)
3. What evidence would contradict this claim? (CONTRADICTS relation)
4. What definitions are needed? (DEFINES relation)
5. What does this claim presuppose? (PRESUPPOSES relation)

For each subclaim:
- State it precisely in canonical form
- Specify the relation type
- Explain why this is a valid decomposition
- Note if it matches an existing claim in the graph
- Indicate if it's atomic (cannot be further decomposed)

Use the search tool to find existing claims that match your subclaims.
"""

        if context:
            prompt += f"\n**Additional context:** {context}\n"

        return prompt

    @classmethod
    def get_atomic_check_prompt(cls, canonical_form: str) -> str:
        """Get a prompt to check if a claim is atomic.

        Args:
            canonical_form: The claim's canonical form

        Returns:
            User prompt for atomic check
        """
        return f"""Determine if the following claim is ATOMIC (cannot be further decomposed).

**Claim:** "{canonical_form}"

A claim is atomic if it:
1. Is a bedrock fact (primary source attestation that no one disputes)
   Example: "BLS published CPI of 6.5% for 2022"

2. Is a contested empirical question (evidence exists but disputed)
   Example: "mRNA vaccines reduce COVID transmission by 80%"

3. Is a fundamental value premise (normative commitment not derivable from facts)
   Example: "Human life has intrinsic value"

Respond with:
- is_atomic: true or false
- atomic_type: "bedrock_fact", "contested_empirical", "value_premise", or null
- reasoning: Explanation of your determination
- potential_subclaims: If not atomic, list possible subclaims to explore
"""

    @classmethod
    def get_refinement_prompt(
        cls,
        original_claim: str,
        proposed_subclaims: list[dict],
        feedback: str,
    ) -> str:
        """Get a prompt for refining a decomposition.

        Args:
            original_claim: The claim being decomposed
            proposed_subclaims: The initial subclaims
            feedback: Feedback on what needs improvement

        Returns:
            User prompt for refinement
        """
        subclaims_str = "\n".join(
            f"- {s['text']} ({s['relation']})" for s in proposed_subclaims
        )

        return f"""Please refine the decomposition of this claim.

**Original claim:**
"{original_claim}"

**Current subclaims:**
{subclaims_str}

**Feedback:**
{feedback}

Please provide an improved decomposition that addresses the feedback.
Maintain the same format for subclaims.
"""

    @classmethod
    def get_batch_decomposition_prompt(
        cls,
        claims: list[dict],
    ) -> str:
        """Get a prompt for decomposing multiple claims.

        Args:
            claims: List of claims with id, canonical_form, claim_type

        Returns:
            User prompt for batch decomposition
        """
        claims_list = "\n".join(
            f"{i+1}. [{c['id']}] \"{c['canonical_form']}\" ({c['claim_type']})"
            for i, c in enumerate(claims)
        )

        return f"""Please decompose each of the following claims into subclaims.

**Claims to decompose:**
{claims_list}

For EACH claim, identify all subclaims with their relations.

Important:
- Look for shared subclaims across claims (reference by ID if found)
- Use the search tool to find existing claims in the graph
- Indicate which subclaims are atomic

Output your decompositions organized by claim ID.
"""
