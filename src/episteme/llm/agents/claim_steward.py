"""Claim Steward agent for ongoing claim management.

The Claim Steward is the ongoing manager of a specific claim's canonical form,
decomposition, and assessment state. It responds to changes in subclaims,
integrates accepted contributions, and maintains the claim over time.
"""

import json
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim
from episteme.domain.contribution import Contribution, ContributionReview
from episteme.domain.assessment import Assessment
from episteme.domain.enums import ClaimState, AssessmentStatus
from episteme.llm.agents.base import GovernanceAgent, AgentConfig, AgentResult
from episteme.llm.prompts.claim_steward import ClaimStewardPrompts

logger = structlog.get_logger()


@dataclass
class StewardshipAction:
    """An action to take on a claim."""

    action: str  # update_canonical, add_subclaim, update_assessment, link_evidence, no_change
    reasoning: str
    changes: dict[str, Any]
    downstream_effects: list[UUID]
    priority: str  # high, medium, low


@dataclass
class StewardshipInput:
    """Input for the steward agent."""

    claim: Claim
    trigger: str  # subclaim_change, contribution_accepted, staleness_check
    context: dict[str, Any]


class ClaimStewardAgent(GovernanceAgent[StewardshipInput, StewardshipAction]):
    """Agent that manages ongoing claim state.

    The Claim Steward handles:
    - Re-assessment when subclaims change
    - Integration of accepted contributions
    - Staleness checks for periodic refresh
    - Canonical form updates

    Example:
        ```python
        agent = ClaimStewardAgent(client)

        # Handle subclaim change
        result = await agent.execute(StewardshipInput(
            claim=claim,
            trigger="subclaim_change",
            context={
                "subclaim": subclaim,
                "old_assessment": old,
                "new_assessment": new,
            },
        ))

        print(result.output.action)  # e.g., "update_assessment"
        print(result.output.changes)  # What to change
        ```
    """

    def __init__(
        self,
        client=None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the steward agent."""
        super().__init__(client=client, config=config or AgentConfig(temperature=0.0))

    def get_system_prompt(self) -> str:
        """Get the system prompt."""
        return ClaimStewardPrompts.get_system_prompt()

    async def execute(
        self,
        input: StewardshipInput,
    ) -> AgentResult[StewardshipAction]:
        """Execute stewardship based on the trigger.

        Args:
            input: The stewardship input

        Returns:
            AgentResult containing the action to take
        """
        start_time = time.time()

        # Build the appropriate prompt based on trigger
        if input.trigger == "subclaim_change":
            user_prompt = self._build_subclaim_change_prompt(input)
        elif input.trigger == "contribution_accepted":
            user_prompt = self._build_contribution_prompt(input)
        elif input.trigger == "staleness_check":
            user_prompt = self._build_staleness_prompt(input)
        else:
            raise ValueError(f"Unknown trigger: {input.trigger}")

        # Get LLM response
        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        # Parse the response
        action = self._parse_response(result.content, input)

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"{input.trigger} for claim {input.claim.id}",
            output_summary=f"action={action.action}",
            execution_time_ms=execution_time,
            usage=result.usage,
        )

        return AgentResult(
            output=action,
            reasoning=action.reasoning,
            usage=result.usage,
            execution_time_ms=execution_time,
            metadata={
                "claim_id": str(input.claim.id),
                "trigger": input.trigger,
            },
        )

    def _build_subclaim_change_prompt(self, input: StewardshipInput) -> str:
        """Build prompt for subclaim change trigger."""
        ctx = input.context
        claim_dict = {
            "id": str(input.claim.id),
            "canonical_form": input.claim.canonical_form,
            "status": ctx.get("current_status", "UNKNOWN"),
            "confidence": ctx.get("current_confidence", 0.0),
            "subclaims": ctx.get("other_subclaims", []),
        }
        return ClaimStewardPrompts.get_subclaim_change_prompt(
            claim=claim_dict,
            subclaim=ctx.get("subclaim", {}),
            old_assessment=ctx.get("old_assessment", {}),
            new_assessment=ctx.get("new_assessment", {}),
        )

    def _build_contribution_prompt(self, input: StewardshipInput) -> str:
        """Build prompt for contribution accepted trigger."""
        ctx = input.context
        claim_dict = {
            "id": str(input.claim.id),
            "canonical_form": input.claim.canonical_form,
            "status": ctx.get("current_status", "UNKNOWN"),
        }
        return ClaimStewardPrompts.get_contribution_accepted_prompt(
            claim=claim_dict,
            contribution=ctx.get("contribution", {}),
            review_decision=ctx.get("review_decision", {}),
        )

    def _build_staleness_prompt(self, input: StewardshipInput) -> str:
        """Build prompt for staleness check trigger."""
        ctx = input.context
        claim_dict = {
            "id": str(input.claim.id),
            "canonical_form": input.claim.canonical_form,
            "status": ctx.get("current_status", "UNKNOWN"),
            "confidence": ctx.get("current_confidence", 0.0),
            "claim_type": input.claim.claim_type.value,
            "open_contributions": ctx.get("open_contributions", 0),
        }
        return ClaimStewardPrompts.get_staleness_check_prompt(
            claim=claim_dict,
            days_since_review=ctx.get("days_since_review", 0),
            instances_added=ctx.get("instances_added", 0),
        )

    def _parse_response(
        self,
        response: str,
        input: StewardshipInput,
    ) -> StewardshipAction:
        """Parse the LLM response into a stewardship action.

        Args:
            response: Raw LLM response
            input: Original input

        Returns:
            Parsed StewardshipAction
        """
        # Try to extract JSON from the response
        action = "no_change"
        reasoning = response
        changes = {}
        downstream_effects = []
        priority = "low"

        # Look for structured markers in the response
        response_lower = response.lower()

        # Determine action
        if "update_assessment" in response_lower or "status" in response_lower and "change" in response_lower:
            action = "update_assessment"
            priority = "high"
        elif "update_canonical" in response_lower or "canonical form" in response_lower and "update" in response_lower:
            action = "update_canonical"
            priority = "medium"
        elif "add_subclaim" in response_lower:
            action = "add_subclaim"
            priority = "medium"
        elif "link_evidence" in response_lower:
            action = "link_evidence"
            priority = "low"
        elif "no change" in response_lower or "no action" in response_lower:
            action = "no_change"
            priority = "low"

        # Try to extract specific changes mentioned
        # Look for status changes
        if "verified" in response_lower:
            changes["new_status"] = AssessmentStatus.VERIFIED.value
        elif "contested" in response_lower:
            changes["new_status"] = AssessmentStatus.CONTESTED.value
        elif "unsupported" in response_lower:
            changes["new_status"] = AssessmentStatus.UNSUPPORTED.value

        # Look for confidence values
        import re
        confidence_match = re.search(r"confidence[:\s]+(\d+\.?\d*)", response_lower)
        if confidence_match:
            try:
                changes["new_confidence"] = float(confidence_match.group(1))
                if changes["new_confidence"] > 1.0:
                    changes["new_confidence"] /= 100  # Convert percentage
            except ValueError:
                pass

        # Look for priority
        if "high priority" in response_lower or "urgent" in response_lower:
            priority = "high"
        elif "medium priority" in response_lower:
            priority = "medium"
        elif "low priority" in response_lower:
            priority = "low"

        return StewardshipAction(
            action=action,
            reasoning=reasoning,
            changes=changes,
            downstream_effects=downstream_effects,
            priority=priority,
        )

    async def handle_subclaim_change(
        self,
        claim: Claim,
        subclaim_id: UUID,
        old_assessment: Assessment | None,
        new_assessment: Assessment,
        other_subclaims: list[dict],
    ) -> AgentResult[StewardshipAction]:
        """Convenience method to handle a subclaim assessment change.

        Args:
            claim: The parent claim
            subclaim_id: ID of the subclaim that changed
            old_assessment: Previous assessment (if any)
            new_assessment: New assessment
            other_subclaims: List of other subclaim info

        Returns:
            AgentResult with the action to take
        """
        return await self.execute(StewardshipInput(
            claim=claim,
            trigger="subclaim_change",
            context={
                "subclaim": {
                    "id": str(subclaim_id),
                    "canonical_form": "Unknown",  # Would be fetched in real usage
                    "relation": "REQUIRES",
                },
                "old_assessment": {
                    "status": old_assessment.status.value if old_assessment else "UNKNOWN",
                    "confidence": old_assessment.confidence if old_assessment else 0.0,
                } if old_assessment else {},
                "new_assessment": {
                    "status": new_assessment.status.value,
                    "confidence": new_assessment.confidence,
                },
                "other_subclaims": other_subclaims,
                "current_status": claim.state.value,
            },
        ))

    async def handle_contribution_accepted(
        self,
        claim: Claim,
        contribution: Contribution,
        review: ContributionReview,
    ) -> AgentResult[StewardshipAction]:
        """Convenience method to handle an accepted contribution.

        Args:
            claim: The affected claim
            contribution: The accepted contribution
            review: The review decision

        Returns:
            AgentResult with the action to take
        """
        return await self.execute(StewardshipInput(
            claim=claim,
            trigger="contribution_accepted",
            context={
                "contribution": {
                    "type": contribution.contribution_type.value,
                    "content": contribution.content,
                    "evidence_urls": contribution.evidence_urls,
                },
                "review_decision": {
                    "reasoning": review.reasoning,
                    "actions": review.actions_if_accepted,
                },
                "current_status": claim.state.value,
            },
        ))

    async def check_staleness(
        self,
        claim: Claim,
        days_since_review: int,
        instances_added: int,
        open_contributions: int,
        current_confidence: float,
    ) -> AgentResult[StewardshipAction]:
        """Convenience method to check if a claim needs refreshing.

        Args:
            claim: The claim to check
            days_since_review: Days since last review
            instances_added: New instances since last review
            open_contributions: Number of open contributions
            current_confidence: Current confidence score

        Returns:
            AgentResult with the action to take
        """
        return await self.execute(StewardshipInput(
            claim=claim,
            trigger="staleness_check",
            context={
                "days_since_review": days_since_review,
                "instances_added": instances_added,
                "open_contributions": open_contributions,
                "current_status": claim.state.value,
                "current_confidence": current_confidence,
            },
        ))
