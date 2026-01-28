"""Prompts for the Dispute Arbitrator agent.

The Dispute Arbitrator handles escalated disputes, contested claims, and
complex decisions that require deeper analysis or multi-model consensus.
"""

from episteme.llm.prompts.constitution import build_admin_prompt
from episteme.llm.prompts.policies import CORE_POLICIES, ARBITRATION_POLICIES


class DisputeArbitratorPrompts:
    """Prompt templates for the Dispute Arbitrator agent."""

    ROLE_PROMPT = f"""# Your Role: Dispute Arbitrator

You are a Dispute Arbitrator for the Episteme knowledge graph. You handle
escalated reviews, appeals, and complex disputes that require deeper analysis
or multi-model consensus.

## When You Are Invoked

- Contribution Reviewer escalated a decision
- Multiple conflicting contributions on the same claim
- Contributor appealed a rejection
- Claim flagged as persistently contested
- High-stakes changes requiring consensus

## Core Responsibilities

1. **Gather Full Context**: Understand the complete history of the claim,
   all contributions, and contributor records.

2. **Apply Policies Rigorously**: Ensure decisions follow established
   policies, resolve any policy conflicts.

3. **Consider Precedent**: How have similar cases been handled?

4. **Assess Evidence Quality**: Weigh evidence according to Source Hierarchy.

5. **Document Thoroughly**: Decisions must be fully auditable.

6. **Recommend Human Review**: When appropriate, flag for human oversight.

## Decision Framework

### Step 1: Context Gathering
- Full claim history (creation, modifications, assessments)
- All contributions related to the dispute
- Contributor records for all parties
- Related claims that may be affected

### Step 2: Policy Analysis
- Which policies are relevant?
- Are there policy conflicts?
- What does each policy imply for this case?

### Step 3: Precedent Review
- Have we seen similar cases?
- How were they resolved?
- Should we follow precedent or distinguish this case?

### Step 4: Evidence Assessment
- What evidence exists for each position?
- How does it rank on the Source Hierarchy?
- Is there a preponderance on one side?

### Step 5: Decision
- What is the resolution?
- If no clear resolution, should the claim be marked CONTESTED?
- Does this need human review?

{CORE_POLICIES}

{ARBITRATION_POLICIES}

## Output Format

Provide:
1. **outcome**: RESOLVED, MARK_CONTESTED, or HUMAN_REVIEW
2. **decision**: Specific action to take
3. **reasoning**: Comprehensive explanation
4. **policy_citations**: All policies applied
5. **evidence_summary**: Summary of evidence considered
6. **precedent_notes**: Similar cases referenced
7. **dissent_notes**: If multi-model, any disagreement
8. **confidence**: 0.0-1.0
9. **human_review_recommended**: true/false with justification

## Quality Standards

- Decisions must be defensible under audit
- No shortcuts for "obvious" cases
- Acknowledge uncertainty when it exists
- Treat all contributors fairly
- Document everything
"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """Get the full system prompt with constitution."""
        return build_admin_prompt(cls.ROLE_PROMPT)

    @classmethod
    def get_escalated_review_prompt(
        cls,
        contribution: dict,
        claim: dict,
        reviewer_notes: str,
        escalation_reason: str,
        claim_history: list,
    ) -> str:
        """Get prompt for handling an escalated review.

        Args:
            contribution: The escalated contribution
            claim: The target claim
            reviewer_notes: Notes from the reviewer who escalated
            escalation_reason: Why it was escalated
            claim_history: History of the claim

        Returns:
            User prompt for arbitration
        """
        history_text = "\n".join(
            f"- {h.get('date', '?')}: {h.get('action', '?')} - {h.get('summary', '')[:100]}"
            for h in claim_history
        ) if claim_history else "(No history available)"

        return f"""An escalated contribution requires arbitration.

**Escalation Reason:**
{escalation_reason}

**Reviewer Notes:**
{reviewer_notes}

**Contribution:**
- Type: {contribution.get('type')}
- Content: "{contribution.get('content')}"
- Evidence: {contribution.get('evidence_urls', [])}
- Contributor Trust: {contribution.get('contributor_trust', 'new')}

**Target Claim:**
- ID: {claim.get('id')}
- Canonical Form: "{claim.get('canonical_form')}"
- Status: {claim.get('status', 'UNKNOWN')}
- Dependents: {claim.get('dependent_count', 0)} claims depend on this

**Claim History:**
{history_text}

**Your Task:**
1. Understand why this was escalated
2. Gather any additional context needed
3. Apply relevant policies
4. Make a definitive decision if possible
5. If genuine disagreement exists, recommend marking as CONTESTED
6. If this is too complex or risky, recommend human review

Provide a comprehensive arbitration decision.
"""

    @classmethod
    def get_appeal_prompt(
        cls,
        contribution: dict,
        original_review: dict,
        appeal: dict,
        claim: dict,
    ) -> str:
        """Get prompt for handling an appeal.

        Args:
            contribution: The original contribution
            original_review: The rejection decision
            appeal: The appeal
            claim: The target claim

        Returns:
            User prompt for appeal arbitration
        """
        return f"""A contribution rejection has been appealed.

**Original Contribution:**
- Type: {contribution.get('type')}
- Content: "{contribution.get('content')}"
- Evidence: {contribution.get('evidence_urls', [])}

**Original Rejection:**
- Decision: REJECT
- Reasoning: "{original_review.get('reasoning')}"
- Policies Cited: {original_review.get('policy_citations', [])}
- Reviewer: {original_review.get('reviewed_by')}

**Appeal:**
- Appellant: {appeal.get('appellant_id')}
- Reasoning: "{appeal.get('appeal_reasoning')}"
- Submitted: {appeal.get('submitted_at')}

**Target Claim:**
- Canonical Form: "{claim.get('canonical_form')}"
- Status: {claim.get('status', 'UNKNOWN')}

**Appeal Review Standards:**
Appeals MUST address:
- What specific error was made in the original decision?
- What new evidence or argument is being presented?
- Why should the original decision be reconsidered?

Appeals that merely restate the original contribution should be denied.

**Your Task:**
1. Did the original review make an error?
2. Does the appeal provide new evidence or arguments?
3. Apply fresh analysis to the contribution
4. Either uphold the rejection (with explanation) or overturn it

Provide your arbitration decision.
"""

    @classmethod
    def get_conflict_resolution_prompt(
        cls,
        claim: dict,
        contributions: list[dict],
    ) -> str:
        """Get prompt for resolving conflicting contributions.

        Args:
            claim: The claim with conflicts
            contributions: List of conflicting contributions

        Returns:
            User prompt for conflict resolution
        """
        contrib_text = ""
        for i, c in enumerate(contributions, 1):
            contrib_text += f"""
---
Contribution #{i}:
- Type: {c.get('type')}
- Position: "{c.get('content')[:300]}..."
- Evidence: {c.get('evidence_urls', [])}
- Contributor: {c.get('contributor_trust', 'new')} (rep: {c.get('contributor_rep', 50):.0f})
"""

        return f"""Multiple conflicting contributions exist for this claim.

**Claim:**
- ID: {claim.get('id')}
- Canonical Form: "{claim.get('canonical_form')}"
- Current Status: {claim.get('status', 'UNKNOWN')}
- Dependents: {claim.get('dependent_count', 0)} claims

**Conflicting Contributions:**
{contrib_text}

**Your Task:**
1. Analyze each contribution's merits
2. Identify where they genuinely conflict vs. talking past each other
3. Apply Source Hierarchy to weigh evidence
4. Determine if one position should prevail, or if CONTESTED is appropriate

Outcomes:
- If one position clearly wins: RESOLVED with that position
- If genuine disagreement with valid positions: MARK_CONTESTED
- If too complex or novel: HUMAN_REVIEW

Provide comprehensive reasoning for your decision.
"""

    @classmethod
    def get_consensus_verification_prompt(
        cls,
        decision: str,
        reasoning: str,
        claim_summary: str,
    ) -> str:
        """Get prompt for verifying consensus (used with second model).

        Args:
            decision: The first model's decision
            reasoning: The first model's reasoning
            claim_summary: Summary of the claim and dispute

        Returns:
            User prompt for consensus check
        """
        return f"""Another model has made the following arbitration decision.
Please review and indicate whether you agree.

**Case Summary:**
{claim_summary}

**Decision Made:**
{decision}

**Reasoning:**
{reasoning}

**Your Task:**
1. Review the reasoning carefully
2. Check for policy compliance
3. Assess whether the decision is sound
4. Indicate AGREE or DISAGREE

If you DISAGREE, explain:
- What specific error did you identify?
- What decision would you make instead?
- What policies or evidence support your position?

If you AGREE, briefly confirm the key points that make this correct.
"""
