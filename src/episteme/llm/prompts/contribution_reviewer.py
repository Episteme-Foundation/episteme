"""Prompts for the Contribution Reviewer agent.

The Contribution Reviewer evaluates incoming contributions against policies,
deciding whether to accept, reject, or escalate to the Dispute Arbitrator.
"""

from episteme.llm.prompts.constitution import build_admin_prompt
from episteme.llm.prompts.policies import CORE_POLICIES, CONTRIBUTION_REVIEW_POLICIES


class ContributionReviewerPrompts:
    """Prompt templates for the Contribution Reviewer agent."""

    ROLE_PROMPT = f"""# Your Role: Contribution Reviewer

You are a Contribution Reviewer for the Episteme knowledge graph. Your task is
to evaluate incoming contributions against established policies and decide
whether to accept, reject, or escalate them.

## Core Responsibilities

1. **Parse Contribution Intent**: Understand what the contributor is trying
   to accomplish.

2. **Check Against Policies**: Evaluate whether the contribution complies
   with Verifiability, Neutral Decomposition, No Original Research, etc.

3. **Evaluate Strength**: Assess the quality of arguments and evidence
   provided.

4. **Make a Decision**: Accept, reject, or escalate based on your evaluation.

5. **Provide Reasoning**: Document your decision clearly for transparency.

## Decision Outputs

**ACCEPT**: The contribution is valid and should be integrated.
- Evidence meets standards
- Argument is sound
- Complies with all policies

**REJECT**: The contribution should not be integrated.
- Violates policies
- Evidence is insufficient
- Argument is flawed
- Must include specific reasoning and policy citations

**ESCALATE**: Uncertain or high-stakes; send to Dispute Arbitrator.
- High-importance claim
- Experienced contributor being rejected
- Multiple conflicting contributions
- Potential systematic issues

## Review Process

For each contribution:

1. **Identify the type**: challenge, support, propose_merge, propose_split,
   propose_edit, add_instance

2. **Check formal requirements**: Does it have necessary fields? Is it
   well-formed?

3. **Evaluate substance**:
   - For challenges: Is there counter-evidence or logical flaw identified?
   - For support: Does the evidence actually support the claim?
   - For merges: Do the claims decompose identically?
   - For splits: Are there distinct decomposition paths?
   - For edits: Is meaning preserved while clarity improved?
   - For instances: Does the source actually make the claim?

4. **Consider contributor context**:
   - Trust level (new, standard, trusted, veteran)
   - Apply Charitable Interpretation
   - Higher trust = more benefit of doubt

5. **Make decision with reasoning**

{CORE_POLICIES}

{CONTRIBUTION_REVIEW_POLICIES}

## Output Format

Provide:
1. **decision**: ACCEPT, REJECT, or ESCALATE
2. **reasoning**: Detailed explanation (2-5 sentences)
3. **confidence**: How confident you are (0.0-1.0)
4. **policy_citations**: Which policies were applied
5. **actions_if_accepted**: What changes to make (if accepting)
6. **feedback_for_contributor**: Constructive feedback (especially for rejections)
"""

    @classmethod
    def get_system_prompt(cls) -> str:
        """Get the full system prompt with constitution."""
        return build_admin_prompt(cls.ROLE_PROMPT)

    @classmethod
    def get_review_prompt(
        cls,
        contribution: dict,
        claim: dict,
        contributor: dict,
    ) -> str:
        """Get prompt for reviewing a contribution.

        Args:
            contribution: The contribution to review
            claim: The claim being modified
            contributor: The contributor's profile

        Returns:
            User prompt for review
        """
        return f"""Please review the following contribution.

**Contribution:**
- Type: {contribution.get('type')}
- Content: "{contribution.get('content')}"
- Evidence URLs: {contribution.get('evidence_urls', [])}
- Submitted: {contribution.get('submitted_at')}

**Target Claim:**
- ID: {claim.get('id')}
- Canonical Form: "{claim.get('canonical_form')}"
- Type: {claim.get('claim_type')}
- Status: {claim.get('status', 'UNKNOWN')}
- Confidence: {claim.get('confidence', 0.0):.2f}

**Contributor:**
- Trust Level: {contributor.get('trust_level', 'new')}
- Reputation Score: {contributor.get('reputation_score', 50):.0f}
- Contributions Accepted: {contributor.get('accepted', 0)}
- Contributions Rejected: {contributor.get('rejected', 0)}

**Review this contribution against policies:**

1. **Verifiability**: Does it trace to sources? Are evidence URLs valid?
2. **No Original Research**: Is it synthesis, not invention?
3. **Charitable Interpretation**: What's the strongest reading?
4. **Type-specific criteria**: Does it meet the requirements for this contribution type?

Then decide: ACCEPT, REJECT, or ESCALATE?

If rejecting, explain specifically what's wrong and what would make it acceptable.
If accepting, specify what changes should be made to the claim.
If escalating, explain why this needs higher-level review.
"""

    @classmethod
    def get_challenge_review_prompt(
        cls,
        contribution: dict,
        claim: dict,
        contributor: dict,
        existing_evidence: list,
    ) -> str:
        """Get prompt for reviewing a challenge contribution.

        Args:
            contribution: The challenge contribution
            claim: The claim being challenged
            contributor: The contributor's profile
            existing_evidence: Current evidence for the claim

        Returns:
            User prompt for challenge review
        """
        evidence_text = "\n".join(
            f"- {e.get('source', 'Unknown')}: {e.get('excerpt', '')[:100]}..."
            for e in existing_evidence
        ) if existing_evidence else "(No existing evidence)"

        return f"""Review this CHALLENGE to an existing claim.

**Challenge:**
"{contribution.get('content')}"

Evidence provided: {contribution.get('evidence_urls', [])}

**Claim Being Challenged:**
"{claim.get('canonical_form')}"

Current Status: {claim.get('status', 'UNKNOWN')}
Current Confidence: {claim.get('confidence', 0.0):.2f}

**Existing Evidence for Claim:**
{evidence_text}

**Contributor:** {contributor.get('trust_level', 'new')} (rep: {contributor.get('reputation_score', 50):.0f})

**Challenge Requirements:**
- MUST provide counter-evidence OR identify logical flaws
- Evidence must meet Source Hierarchy standards
- Challenge must be specific (what exactly is wrong?)
- Vague objections ("this seems off") are insufficient

Evaluate:
1. Does the challenge identify a specific problem?
2. Is counter-evidence provided? Is it credible?
3. Does the challenge warrant changing the claim's status?
4. Should this become CONTESTED rather than VERIFIED/UNSUPPORTED?

Decision: ACCEPT, REJECT, or ESCALATE?
"""

    @classmethod
    def get_merge_review_prompt(
        cls,
        contribution: dict,
        claim1: dict,
        claim2: dict,
        contributor: dict,
    ) -> str:
        """Get prompt for reviewing a merge proposal.

        Args:
            contribution: The merge proposal
            claim1: First claim
            claim2: Second claim (merge target)
            contributor: The contributor's profile

        Returns:
            User prompt for merge review
        """
        return f"""Review this PROPOSE_MERGE contribution.

**Proposal:**
"{contribution.get('content')}"

**Claim 1:**
- ID: {claim1.get('id')}
- Canonical Form: "{claim1.get('canonical_form')}"
- Subclaims: {len(claim1.get('subclaims', []))}

**Claim 2 (merge target):**
- ID: {claim2.get('id')}
- Canonical Form: "{claim2.get('canonical_form')}"
- Subclaims: {len(claim2.get('subclaims', []))}

**Contributor:** {contributor.get('trust_level', 'new')} (rep: {contributor.get('reputation_score', 50):.0f})

**Merge Requirements:**
- Must demonstrate claims decompose identically
- Surface differences in wording don't prevent merge
- Substantive differences in decomposition DO prevent merge

Evaluate:
1. Are these claims semantically equivalent?
2. Do they (or would they) decompose to the same subclaims?
3. Is one a better canonical form than the other?
4. Are there instances that would need reassignment?

Decision: ACCEPT, REJECT, or ESCALATE?

If accepting, specify:
- Which claim should be the surviving canonical form
- How should instances be handled
"""

    @classmethod
    def get_edit_review_prompt(
        cls,
        contribution: dict,
        claim: dict,
        contributor: dict,
    ) -> str:
        """Get prompt for reviewing an edit proposal.

        Args:
            contribution: The edit proposal
            claim: The claim being edited
            contributor: The contributor's profile

        Returns:
            User prompt for edit review
        """
        return f"""Review this PROPOSE_EDIT contribution.

**Current Canonical Form:**
"{claim.get('canonical_form')}"

**Proposed New Form:**
"{contribution.get('proposed_canonical_form', contribution.get('content'))}"

**Justification:**
"{contribution.get('content')}"

**Contributor:** {contributor.get('trust_level', 'new')} (rep: {contributor.get('reputation_score', 50):.0f})

**Edit Requirements:**
- Must preserve claim meaning while improving clarity
- Cannot smuggle in substantive changes as "clarification"
- Should cite why new form is better

Evaluate:
1. Does the proposed form preserve the original meaning?
2. Is the new form actually clearer or better?
3. Are there any hidden substantive changes?
4. Would this affect how the claim decomposes?

Decision: ACCEPT, REJECT, or ESCALATE?

If accepting, the claim steward will implement the change.
"""

    @classmethod
    def get_batch_review_prompt(
        cls,
        contributions: list[dict],
    ) -> str:
        """Get prompt for reviewing multiple contributions.

        Args:
            contributions: List of contributions with their contexts

        Returns:
            User prompt for batch review
        """
        items = []
        for i, c in enumerate(contributions, 1):
            items.append(f"""
---
#{i} - {c.get('type')}
Content: "{c.get('content')[:200]}..."
Target: "{c.get('claim_canonical', 'Unknown')[:100]}..."
Contributor: {c.get('trust_level', 'new')} (rep: {c.get('reputation', 50):.0f})
""")

        return f"""Review the following contributions in batch.

{chr(10).join(items)}

For each contribution, provide:
1. Number
2. Decision (ACCEPT/REJECT/ESCALATE)
3. Brief reasoning (1-2 sentences)
4. Key policy citation

Focus on clear policy violations and straightforward acceptances.
Flag anything complex for individual review.
"""
