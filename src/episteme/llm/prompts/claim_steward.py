"""Prompts for the Claim Steward agent.

The Claim Steward is the ongoing manager of a specific claim's canonical form,
decomposition, and assessment. It responds to changes and maintains claim state.
"""

from episteme.llm.prompts.constitution import build_admin_prompt
from episteme.llm.prompts.policies import CORE_POLICIES


class ClaimStewardPrompts:
    """Prompt templates for the Claim Steward agent."""

    ROLE_PROMPT = f"""# Your Role: Claim Steward

You are a Claim Steward for the Episteme knowledge graph. You are the ongoing
manager of claims, responsible for maintaining their canonical forms,
decompositions, and assessment status over time.

## Core Responsibilities

1. **Maintain Canonical Form**: Update the canonical form when better
   formulations are proposed, while preserving meaning.

2. **Keep Decomposition Current**: Add subclaims as new dependencies are
   discovered, ensure the tree remains accurate.

3. **Propagate Assessment Changes**: When subclaim assessments change,
   re-evaluate the parent claim's status.

4. **Respond to Contributions**: Integrate accepted contributions into the
   claim's structure and status.

5. **Log All Changes**: Every modification must include reasoning for the
   audit trail.

## Triggers for Your Action

You are invoked when:
- A subclaim's assessment changes → re-assess the parent
- New evidence is linked to a claim → re-evaluate
- A contribution is accepted → integrate the change
- Periodic refresh → check for staleness

## Decision Framework

When evaluating changes:

1. **Assess Impact**: How does this change affect the claim?
   - Does the status need to change?
   - Does confidence need adjustment?
   - Are there downstream claims affected?

2. **Apply Policies**: Ensure changes comply with:
   - Verifiability (all claims trace to sources)
   - Neutral Decomposition (no bias in structure)
   - Explicit Uncertainty (honest about unknowns)

3. **Document Reasoning**: Every change needs a clear explanation
   that can be audited later.

## Output Requirements

For each stewardship action, provide:

1. **action**: What you're doing (update_canonical, add_subclaim,
   update_assessment, link_evidence, no_change)
2. **reasoning**: Why this action is appropriate
3. **changes**: Specific modifications to make
4. **downstream_effects**: Claims that may need re-evaluation
5. **priority**: How urgent are downstream updates (high/medium/low)

{CORE_POLICIES}

## Quality Standards

- Never make changes without clear justification
- Preserve claim meaning during edits
- Propagate changes systematically, not arbitrarily
- Maintain an accurate audit trail
- When uncertain, err toward no change
"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """Get the full system prompt with constitution."""
        return build_admin_prompt(cls.ROLE_PROMPT)

    @classmethod
    def get_subclaim_change_prompt(
        cls,
        claim: dict,
        subclaim: dict,
        old_assessment: dict,
        new_assessment: dict,
    ) -> str:
        """Get prompt for handling a subclaim assessment change.

        Args:
            claim: The parent claim
            subclaim: The subclaim that changed
            old_assessment: Previous assessment
            new_assessment: New assessment

        Returns:
            User prompt for stewardship decision
        """
        return f"""A subclaim's assessment has changed. Evaluate if the parent claim needs updating.

**Parent Claim:**
- ID: {claim.get('id')}
- Canonical Form: "{claim.get('canonical_form')}"
- Current Status: {claim.get('status', 'UNKNOWN')}
- Current Confidence: {claim.get('confidence', 0.0):.2f}

**Subclaim That Changed:**
- ID: {subclaim.get('id')}
- Canonical Form: "{subclaim.get('canonical_form')}"
- Relation to Parent: {subclaim.get('relation', 'REQUIRES')}

**Assessment Change:**
- Old Status: {old_assessment.get('status', 'UNKNOWN')}
- New Status: {new_assessment.get('status', 'UNKNOWN')}
- Old Confidence: {old_assessment.get('confidence', 0.0):.2f}
- New Confidence: {new_assessment.get('confidence', 0.0):.2f}

**Other Subclaims:**
{cls._format_subclaims(claim.get('subclaims', []))}

Based on the aggregation rules:
1. If ANY required subclaim is UNSUPPORTED → parent leans UNSUPPORTED
2. If ANY required subclaim is CONTESTED → parent is CONTESTED
3. If ALL required subclaims are VERIFIED → parent is stronger

Determine:
1. Does the parent's status need to change?
2. How does confidence change?
3. What is the reasoning?
4. Are there claims that depend on this parent that also need re-evaluation?
"""

    @classmethod
    def get_contribution_accepted_prompt(
        cls,
        claim: dict,
        contribution: dict,
        review_decision: dict,
    ) -> str:
        """Get prompt for integrating an accepted contribution.

        Args:
            claim: The affected claim
            contribution: The accepted contribution
            review_decision: The review decision with actions

        Returns:
            User prompt for integration
        """
        return f"""A contribution has been accepted and needs to be integrated.

**Claim:**
- ID: {claim.get('id')}
- Canonical Form: "{claim.get('canonical_form')}"
- Current Status: {claim.get('status', 'UNKNOWN')}

**Accepted Contribution:**
- Type: {contribution.get('type')}
- Content: "{contribution.get('content')}"
- Evidence URLs: {contribution.get('evidence_urls', [])}

**Review Decision:**
- Reasoning: {review_decision.get('reasoning')}
- Actions to Take: {review_decision.get('actions', [])}

Integrate this contribution:
1. What specific changes should be made to the claim?
2. Does the status need updating?
3. Are there new decomposition edges to add?
4. What should the audit log entry say?
5. Are there downstream effects to propagate?
"""

    @classmethod
    def get_staleness_check_prompt(
        cls,
        claim: dict,
        days_since_review: int,
        instances_added: int,
    ) -> str:
        """Get prompt for checking if a claim needs refreshing.

        Args:
            claim: The claim to check
            days_since_review: Days since last review
            instances_added: New instances since last review

        Returns:
            User prompt for staleness check
        """
        return f"""Periodic review: Determine if this claim needs refreshing.

**Claim:**
- ID: {claim.get('id')}
- Canonical Form: "{claim.get('canonical_form')}"
- Status: {claim.get('status', 'UNKNOWN')}
- Confidence: {claim.get('confidence', 0.0):.2f}
- Claim Type: {claim.get('claim_type')}

**Activity:**
- Days since last review: {days_since_review}
- New instances added since review: {instances_added}
- Open contributions: {claim.get('open_contributions', 0)}

**Review Indicators:**
- Time-sensitive claim (current events)? Consider if the claim may have become outdated.
- New evidence available? New instances may contain relevant updates.
- Unresolved contributions? May indicate dispute or needed changes.

Determine:
1. Does this claim need re-evaluation? (yes/no)
2. Priority level (high/medium/low)
3. What specifically should be reviewed?
4. Any concerns about the current status?
"""

    @classmethod
    def _format_subclaims(cls, subclaims: list) -> str:
        """Format subclaims for display."""
        if not subclaims:
            return "(No other subclaims)"

        lines = []
        for sc in subclaims:
            lines.append(
                f"- {sc.get('canonical_form', 'Unknown')[:50]}... "
                f"[{sc.get('relation', '?')}] "
                f"Status: {sc.get('status', 'UNKNOWN')}, "
                f"Conf: {sc.get('confidence', 0.0):.2f}"
            )
        return "\n".join(lines)
