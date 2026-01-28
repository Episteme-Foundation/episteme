"""Contribution Reviewer agent for evaluating contributions.

The Contribution Reviewer evaluates incoming contributions against established
policies and decides whether to accept, reject, or escalate them to the
Dispute Arbitrator.
"""

import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim
from episteme.domain.contribution import Contribution, ContributionReview
from episteme.domain.contributor import Contributor
from episteme.domain.enums import ContributionType, ReviewDecision
from episteme.llm.agents.base import GovernanceAgent, AgentConfig, AgentResult
from episteme.llm.prompts.contribution_reviewer import ContributionReviewerPrompts
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class ReviewInput:
    """Input for reviewing a contribution."""

    contribution: Contribution
    claim: Claim
    contributor: Contributor
    # Optional additional context
    existing_evidence: list[dict] = field(default_factory=list)
    merge_target_claim: Claim | None = None


@dataclass
class ReviewOutput:
    """Output from reviewing a contribution."""

    decision: ReviewDecision
    reasoning: str
    confidence: float
    policy_citations: list[str]
    actions_if_accepted: list[str]
    feedback_for_contributor: str


class ContributionReviewerAgent(GovernanceAgent[ReviewInput, ReviewOutput]):
    """Agent that reviews incoming contributions.

    The Contribution Reviewer handles:
    - Evaluating contributions against policies
    - Deciding to accept, reject, or escalate
    - Providing reasoning and feedback
    - Citing relevant policies

    Example:
        ```python
        agent = ContributionReviewerAgent(client)

        result = await agent.execute(ReviewInput(
            contribution=contribution,
            claim=claim,
            contributor=contributor,
        ))

        if result.output.decision == ReviewDecision.ACCEPT:
            # Implement the contribution
            ...
        elif result.output.decision == ReviewDecision.ESCALATE:
            # Send to arbitrator
            ...
        ```
    """

    def __init__(
        self,
        client=None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the reviewer agent."""
        super().__init__(client=client, config=config or AgentConfig(temperature=0.0))
        self._settings = get_settings()

    def get_system_prompt(self) -> str:
        """Get the system prompt."""
        return ContributionReviewerPrompts.get_system_prompt()

    async def execute(
        self,
        input: ReviewInput,
    ) -> AgentResult[ReviewOutput]:
        """Execute the review.

        Args:
            input: The review input

        Returns:
            AgentResult containing the review decision
        """
        start_time = time.time()

        # Build the appropriate prompt based on contribution type
        user_prompt = self._build_review_prompt(input)

        # Get LLM response
        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        # Parse the response
        output = self._parse_response(result.content, input)

        # Apply confidence thresholds for automatic decisions
        output = self._apply_thresholds(output)

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"Review {input.contribution.contribution_type.value} for claim {input.claim.id}",
            output_summary=f"decision={output.decision.value}, confidence={output.confidence:.2f}",
            execution_time_ms=execution_time,
            usage=result.usage,
        )

        return AgentResult(
            output=output,
            reasoning=output.reasoning,
            usage=result.usage,
            execution_time_ms=execution_time,
            metadata={
                "contribution_id": str(input.contribution.id),
                "claim_id": str(input.claim.id),
                "contribution_type": input.contribution.contribution_type.value,
            },
        )

    def _build_review_prompt(self, input: ReviewInput) -> str:
        """Build the review prompt based on contribution type."""
        contrib_type = input.contribution.contribution_type

        # Build contributor dict
        contributor_dict = {
            "trust_level": input.contributor.trust_level,
            "reputation_score": input.contributor.reputation_score,
            "accepted": input.contributor.contributions_accepted,
            "rejected": input.contributor.contributions_rejected,
        }

        # Build claim dict
        claim_dict = {
            "id": str(input.claim.id),
            "canonical_form": input.claim.canonical_form,
            "claim_type": input.claim.claim_type.value,
            "status": input.claim.state.value,
            "confidence": 0.0,  # Would be fetched from assessment
        }

        # Build contribution dict
        contribution_dict = {
            "type": input.contribution.contribution_type.value,
            "content": input.contribution.content,
            "evidence_urls": input.contribution.evidence_urls,
            "submitted_at": input.contribution.submitted_at.isoformat(),
            "proposed_canonical_form": input.contribution.proposed_canonical_form,
        }

        # Use type-specific prompts where appropriate
        if contrib_type == ContributionType.CHALLENGE:
            return ContributionReviewerPrompts.get_challenge_review_prompt(
                contribution=contribution_dict,
                claim=claim_dict,
                contributor=contributor_dict,
                existing_evidence=input.existing_evidence,
            )
        elif contrib_type == ContributionType.PROPOSE_MERGE and input.merge_target_claim:
            claim2_dict = {
                "id": str(input.merge_target_claim.id),
                "canonical_form": input.merge_target_claim.canonical_form,
                "subclaims": [],  # Would be fetched
            }
            return ContributionReviewerPrompts.get_merge_review_prompt(
                contribution=contribution_dict,
                claim1=claim_dict,
                claim2=claim2_dict,
                contributor=contributor_dict,
            )
        elif contrib_type == ContributionType.PROPOSE_EDIT:
            return ContributionReviewerPrompts.get_edit_review_prompt(
                contribution=contribution_dict,
                claim=claim_dict,
                contributor=contributor_dict,
            )
        else:
            # Use the general review prompt
            return ContributionReviewerPrompts.get_review_prompt(
                contribution=contribution_dict,
                claim=claim_dict,
                contributor=contributor_dict,
            )

    def _parse_response(
        self,
        response: str,
        input: ReviewInput,
    ) -> ReviewOutput:
        """Parse the LLM response into a review output.

        Args:
            response: Raw LLM response
            input: Original input

        Returns:
            Parsed ReviewOutput
        """
        response_lower = response.lower()

        # Determine decision
        if "accept" in response_lower and "reject" not in response_lower[:response_lower.find("accept") if "accept" in response_lower else 0]:
            decision = ReviewDecision.ACCEPT
        elif "escalate" in response_lower:
            decision = ReviewDecision.ESCALATE
        else:
            decision = ReviewDecision.REJECT

        # Extract confidence
        import re
        confidence = 0.7  # Default
        confidence_match = re.search(r"confidence[:\s]+(\d+\.?\d*)", response_lower)
        if confidence_match:
            try:
                confidence = float(confidence_match.group(1))
                if confidence > 1.0:
                    confidence /= 100
            except ValueError:
                pass

        # Extract policy citations
        policy_citations = []
        for policy in ["verifiability", "neutral decomposition", "source hierarchy",
                      "no original research", "charitable interpretation", "explicit uncertainty"]:
            if policy in response_lower:
                policy_citations.append(policy.upper().replace(" ", "_"))

        # Extract actions (for accept decisions)
        actions = []
        if decision == ReviewDecision.ACCEPT:
            if "update" in response_lower and "status" in response_lower:
                actions.append("update_claim_status")
            if "add" in response_lower and "evidence" in response_lower:
                actions.append("add_evidence")
            if "merge" in response_lower:
                actions.append("merge_claims")
            if "edit" in response_lower or "canonical" in response_lower:
                actions.append("update_canonical_form")
            if "mark" in response_lower and "contested" in response_lower:
                actions.append("mark_contested")

        # Generate feedback
        feedback = self._extract_feedback(response, decision)

        return ReviewOutput(
            decision=decision,
            reasoning=response,
            confidence=confidence,
            policy_citations=policy_citations,
            actions_if_accepted=actions,
            feedback_for_contributor=feedback,
        )

    def _extract_feedback(self, response: str, decision: ReviewDecision) -> str:
        """Extract constructive feedback from the response."""
        if decision == ReviewDecision.ACCEPT:
            return "Your contribution has been accepted. Thank you for improving the knowledge graph."
        elif decision == ReviewDecision.ESCALATE:
            return "Your contribution has been escalated for further review due to its complexity or importance."
        else:
            # For rejections, try to extract the reasoning
            # Look for sections that explain what would make it acceptable
            feedback = "Your contribution was not accepted. "

            response_lower = response.lower()
            if "evidence" in response_lower:
                feedback += "Consider providing more specific evidence with verifiable sources. "
            if "specific" in response_lower:
                feedback += "Please be more specific about what exactly you're challenging or proposing. "
            if "policy" in response_lower:
                feedback += "Your contribution may not align with our policies. "

            feedback += "You may appeal this decision if you believe it was made in error."
            return feedback

    def _apply_thresholds(self, output: ReviewOutput) -> ReviewOutput:
        """Apply confidence thresholds for automatic decisions.

        High confidence accepts/rejects can be auto-applied.
        Low confidence decisions should be escalated.
        """
        settings = self._settings.processing

        # If confidence is very high, keep the decision
        if output.confidence >= settings.auto_accept_confidence_threshold:
            return output
        if output.confidence >= settings.auto_reject_confidence_threshold:
            return output

        # If confidence is below escalation threshold, escalate
        if output.confidence < settings.escalation_confidence_threshold:
            return ReviewOutput(
                decision=ReviewDecision.ESCALATE,
                reasoning=f"Original decision: {output.decision.value}. "
                         f"Escalated due to low confidence ({output.confidence:.2f}). "
                         f"Original reasoning: {output.reasoning[:500]}...",
                confidence=output.confidence,
                policy_citations=output.policy_citations,
                actions_if_accepted=output.actions_if_accepted,
                feedback_for_contributor="Your contribution is being reviewed by a senior reviewer.",
            )

        return output

    async def review_batch(
        self,
        inputs: list[ReviewInput],
    ) -> list[AgentResult[ReviewOutput]]:
        """Review multiple contributions.

        Args:
            inputs: List of review inputs

        Returns:
            List of review results
        """
        # For now, process sequentially
        # Could be parallelized in the future
        results = []
        for inp in inputs:
            result = await self.execute(inp)
            results.append(result)
        return results

    def create_review_record(
        self,
        contribution: Contribution,
        output: ReviewOutput,
    ) -> ContributionReview:
        """Create a ContributionReview record from the output.

        Args:
            contribution: The contribution that was reviewed
            output: The review output

        Returns:
            ContributionReview record ready for storage
        """
        return ContributionReview(
            contribution_id=contribution.id,
            decision=output.decision,
            reasoning=output.reasoning,
            confidence=output.confidence,
            policy_citations=output.policy_citations,
            actions_if_accepted=output.actions_if_accepted,
            reviewed_by="contribution_reviewer",
        )
