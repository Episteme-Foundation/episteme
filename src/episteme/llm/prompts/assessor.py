"""Prompts for the Assessor agent.

The Assessor evaluates claim validity by traversing decomposition trees
bottom-up, aggregating subclaim assessments to determine parent status.
It produces transparent reasoning traces that explain every assessment.
"""

from episteme.llm.prompts.constitution import build_admin_prompt


class AssessorPrompts:
    """Prompt templates for the Assessor agent."""

    ROLE_PROMPT = """# Your Role: Claim Assessor

You are a Claim Assessor for the Episteme knowledge graph. Your task is to
evaluate the validity of claims based on their decomposition trees and
available evidence.

## Core Principle: Transparent Aggregation

Assessment flows bottom-up: you evaluate leaf claims (atomic claims at the
base of the tree) and aggregate their statuses upward. Every assessment
must include a clear reasoning trace explaining how you arrived at the
status.

## Assessment Statuses

Claims can have one of four statuses:

- **VERIFIED**: All required supporting evidence is confirmed, no credible
  challenges exist. High confidence that the claim is true.

- **CONTESTED**: Genuine disagreement exists with documented positions on
  multiple sides. This is NOT a failure state - it's honest acknowledgment
  that reasonable people/sources disagree.

- **UNSUPPORTED**: The claim lacks sufficient evidence or supporting
  decomposition. Cannot be verified but not necessarily false.

- **UNKNOWN**: Not yet assessed or insufficient information to assess.
  This is the initial state for new claims.

## Aggregation Rules

When aggregating subclaim assessments to determine parent status:

1. **Required subclaims (REQUIRES relation)**:
   - If ANY required subclaim is UNSUPPORTED → parent leans UNSUPPORTED
   - If ANY required subclaim is CONTESTED → parent is CONTESTED
   - If ALL required subclaims are VERIFIED → parent is stronger

2. **Supporting subclaims (SUPPORTS relation)**:
   - VERIFIED support strengthens confidence
   - CONTESTED support weakens confidence
   - Support is not strictly required

3. **Contradicting subclaims (CONTRADICTS relation)**:
   - VERIFIED contradiction → parent is likely false (CONTESTED or UNSUPPORTED)
   - CONTESTED contradiction → introduces doubt

4. **Definitional subclaims (DEFINES relation)**:
   - These define terms; their status affects interpretation
   - CONTESTED definitions often make parent CONTESTED

5. **Presupposed subclaims (PRESUPPOSES relation)**:
   - Hidden assumptions that if false, invalidate the argument
   - UNSUPPORTED presuppositions weaken the parent

## Confidence Calculation

Confidence should reflect:
- Strength of evidence (how well-supported are the subclaims?)
- Source quality (primary sources > secondary sources)
- Consensus level (widespread agreement vs. disputed)
- Chain length (confidence decreases with each aggregation step)

General guideline: Parent confidence ≤ minimum confidence of required subclaims

## Handling Atomic Claims

Atomic claims (leaves of the decomposition tree) require special handling:

1. **Bedrock facts**: Should be VERIFIED with high confidence if they
   cite authoritative primary sources (BLS data, peer-reviewed papers, etc.)

2. **Contested empirical**: Should be CONTESTED with reasoning explaining
   the nature of the disagreement

3. **Value premises**: Should be marked as non-empirical (these cannot be
   verified/falsified, only acknowledged)

## Output Format

For each assessment, provide:
1. **status**: One of VERIFIED, CONTESTED, UNSUPPORTED, UNKNOWN
2. **confidence**: Float between 0.0 and 1.0
3. **reasoning_trace**: Detailed explanation of how you reached this status
4. **evidence_for**: IDs of claims supporting this claim
5. **evidence_against**: IDs of claims contradicting this claim
6. **subclaim_summary**: Count of subclaims by status

## Quality Standards

From the Constitution:
- NEVER fake confidence - if uncertain, say so
- Mark contested claims as contested, don't pick a side
- Show your work - reasoning must be auditable
- Be conservative - prefer UNKNOWN to false certainty
- Propagate uncertainty honestly up the tree
"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """Get the full system prompt with constitution."""
        return build_admin_prompt(cls.ROLE_PROMPT)

    @classmethod
    def get_assessment_prompt(
        cls,
        canonical_form: str,
        claim_type: str,
        subclaims: list[dict],
    ) -> str:
        """Get the user prompt for assessing a claim.

        Args:
            canonical_form: The claim's canonical form
            claim_type: Type of claim (empirical, normative, etc.)
            subclaims: List of subclaim dicts with their assessments

        Returns:
            User prompt for assessment
        """
        subclaims_text = ""
        if subclaims:
            for i, sc in enumerate(subclaims, 1):
                subclaims_text += f"""
{i}. **Subclaim**: "{sc.get('canonical_form', 'Unknown')}"
   - Relation: {sc.get('relation', 'unknown')}
   - Status: {sc.get('status', 'UNKNOWN')}
   - Confidence: {sc.get('confidence', 0.0):.2f}
   - Reasoning: {sc.get('reasoning', 'No reasoning provided')[:200]}...
"""
        else:
            subclaims_text = "\n(No subclaims - this is an atomic claim)\n"

        return f"""Please assess the following claim based on its subclaims.

**Claim to assess:**
"{canonical_form}"

**Claim type:** {claim_type}

**Subclaims and their assessments:**
{subclaims_text}

Based on the subclaim assessments and their relations:

1. Determine the appropriate status (VERIFIED, CONTESTED, UNSUPPORTED, or UNKNOWN)
2. Calculate the confidence level (0.0-1.0)
3. Provide a detailed reasoning trace explaining your assessment
4. Identify which subclaims serve as evidence for or against this claim
5. Summarize the subclaim statuses

Remember:
- If any REQUIRED subclaim is UNSUPPORTED, the parent leans UNSUPPORTED
- If any REQUIRED subclaim is CONTESTED, the parent is CONTESTED
- Confidence should not exceed the minimum confidence of required subclaims
- Be explicit about uncertainty
"""

    @classmethod
    def get_atomic_assessment_prompt(
        cls,
        canonical_form: str,
        claim_type: str,
        atomic_type: str | None,
        instances: list[dict] | None = None,
    ) -> str:
        """Get the user prompt for assessing an atomic claim.

        Args:
            canonical_form: The claim's canonical form
            claim_type: Type of claim
            atomic_type: Type of atomic claim (bedrock_fact, contested_empirical, value_premise)
            instances: List of instances (source occurrences) of this claim

        Returns:
            User prompt for atomic assessment
        """
        instances_text = ""
        if instances:
            for i, inst in enumerate(instances, 1):
                instances_text += f"""
{i}. Source: {inst.get('source_title', 'Unknown source')}
   - Type: {inst.get('source_type', 'unknown')}
   - Original text: "{inst.get('original_text', '')[:200]}..."
   - Confidence: {inst.get('confidence', 0.0):.2f}
"""
        else:
            instances_text = "\n(No source instances found)\n"

        return f"""Please assess the following atomic claim (no subclaims to aggregate).

**Claim to assess:**
"{canonical_form}"

**Claim type:** {claim_type}
**Atomic type:** {atomic_type or 'Not specified'}

**Source instances:**
{instances_text}

For atomic claims, assessment depends on the type:

1. **Bedrock facts**: If this cites authoritative primary sources with no
   credible dispute, it should be VERIFIED with high confidence.

2. **Contested empirical**: If experts disagree about this claim, it should
   be CONTESTED with explanation of the disagreement.

3. **Value premises**: These cannot be verified empirically. Mark as CONTESTED
   or note that this is a normative claim that reasonable people disagree on.

Provide:
1. Status (VERIFIED, CONTESTED, UNSUPPORTED, or UNKNOWN)
2. Confidence (0.0-1.0)
3. Detailed reasoning trace
4. Note if this requires additional evidence to assess
"""

    @classmethod
    def get_reassessment_prompt(
        cls,
        canonical_form: str,
        previous_assessment: dict,
        trigger: str,
        changes: list[dict],
    ) -> str:
        """Get the user prompt for reassessing a claim after changes.

        Args:
            canonical_form: The claim's canonical form
            previous_assessment: The previous assessment
            trigger: What triggered the reassessment
            changes: List of changes that occurred

        Returns:
            User prompt for reassessment
        """
        changes_text = "\n".join(
            f"- {c.get('subclaim', 'Unknown')}: {c.get('old_status', '?')} → {c.get('new_status', '?')}"
            for c in changes
        )

        return f"""A claim needs reassessment due to changes in its subclaims.

**Claim:**
"{canonical_form}"

**Previous assessment:**
- Status: {previous_assessment.get('status', 'UNKNOWN')}
- Confidence: {previous_assessment.get('confidence', 0.0):.2f}
- Reasoning: {previous_assessment.get('reasoning', 'No reasoning')[:300]}...

**Trigger for reassessment:** {trigger}

**Changes:**
{changes_text}

Given these changes, reassess the claim:
1. Does the status need to change?
2. How does the confidence change?
3. Explain how the changes affect the overall assessment
4. Provide updated reasoning trace
"""

    @classmethod
    def get_batch_assessment_prompt(
        cls,
        claims: list[dict],
    ) -> str:
        """Get the user prompt for assessing multiple claims.

        Args:
            claims: List of claims with their subclaim assessments

        Returns:
            User prompt for batch assessment
        """
        claims_text = ""
        for i, c in enumerate(claims, 1):
            claims_text += f"""
---
Claim {i}: "{c.get('canonical_form', 'Unknown')}"
Type: {c.get('claim_type', 'unknown')}
Subclaims: {len(c.get('subclaims', []))}
"""

        return f"""Please assess each of the following claims.

{claims_text}

For each claim, provide:
1. The claim ID
2. Status (VERIFIED, CONTESTED, UNSUPPORTED, UNKNOWN)
3. Confidence (0.0-1.0)
4. Brief reasoning (1-2 sentences)

Process these in dependency order - assess claims whose subclaims are already
assessed before assessing claims that depend on them.
"""
