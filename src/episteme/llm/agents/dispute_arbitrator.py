"""Dispute Arbitrator agent for handling escalated disputes.

The Dispute Arbitrator handles escalated reviews, appeals, and complex disputes
that require deeper analysis or multi-model consensus.
"""

import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim
from episteme.domain.contribution import (
    Contribution,
    ContributionReview,
    Appeal,
    ArbitrationResult,
)
from episteme.domain.enums import ArbitrationOutcome, ReviewDecision
from episteme.llm.agents.base import GovernanceAgent, AgentConfig, AgentResult
from episteme.llm.client import AnthropicClient
from episteme.llm.prompts.dispute_arbitrator import DisputeArbitratorPrompts
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class ArbitrationInput:
    """Input for arbitration."""

    contribution: Contribution
    claim: Claim
    trigger: str  # escalated_review, appeal, conflict_resolution
    # Context varies by trigger
    reviewer_notes: str = ""
    escalation_reason: str = ""
    claim_history: list[dict] = field(default_factory=list)
    original_review: ContributionReview | None = None
    appeal: Appeal | None = None
    conflicting_contributions: list[Contribution] = field(default_factory=list)


@dataclass
class ArbitrationOutput:
    """Output from arbitration."""

    outcome: ArbitrationOutcome
    decision: str
    reasoning: str
    policy_citations: list[str]
    evidence_summary: str
    precedent_notes: str
    consensus_achieved: bool
    model_votes: dict[str, str]
    confidence: float
    human_review_recommended: bool


class DisputeArbitratorAgent(GovernanceAgent[ArbitrationInput, ArbitrationOutput]):
    """Agent that handles escalated disputes and appeals.

    The Dispute Arbitrator handles:
    - Escalated contribution reviews
    - Appeals of rejected contributions
    - Resolution of conflicting contributions
    - Multi-model consensus for high-stakes decisions

    Example:
        ```python
        agent = DisputeArbitratorAgent(client)

        # Handle an appeal
        result = await agent.execute(ArbitrationInput(
            contribution=contribution,
            claim=claim,
            trigger="appeal",
            original_review=review,
            appeal=appeal,
        ))

        if result.output.outcome == ArbitrationOutcome.RESOLVED:
            # Implement the decision
            ...
        elif result.output.human_review_recommended:
            # Flag for human review
            ...
        ```
    """

    def __init__(
        self,
        client=None,
        config: AgentConfig | None = None,
        use_multi_model: bool = True,
    ) -> None:
        """Initialize the arbitrator agent.

        Args:
            client: Anthropic client
            config: Agent configuration
            use_multi_model: Whether to use multi-model consensus for high-stakes
        """
        super().__init__(client=client, config=config or AgentConfig(temperature=0.0))
        self._settings = get_settings()
        self._use_multi_model = use_multi_model

    def get_system_prompt(self) -> str:
        """Get the system prompt."""
        return DisputeArbitratorPrompts.get_system_prompt()

    async def execute(
        self,
        input: ArbitrationInput,
    ) -> AgentResult[ArbitrationOutput]:
        """Execute the arbitration.

        Args:
            input: The arbitration input

        Returns:
            AgentResult containing the arbitration decision
        """
        start_time = time.time()

        # Build the appropriate prompt
        if input.trigger == "escalated_review":
            user_prompt = self._build_escalated_review_prompt(input)
        elif input.trigger == "appeal":
            user_prompt = self._build_appeal_prompt(input)
        elif input.trigger == "conflict_resolution":
            user_prompt = self._build_conflict_prompt(input)
        else:
            raise ValueError(f"Unknown trigger: {input.trigger}")

        # Determine if this needs multi-model consensus
        needs_consensus = self._needs_multi_model_consensus(input)

        if needs_consensus and self._use_multi_model:
            output = await self._arbitrate_with_consensus(user_prompt, input)
        else:
            output = await self._arbitrate_single_model(user_prompt, input)

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"Arbitrate {input.trigger} for claim {input.claim.id}",
            output_summary=f"outcome={output.outcome.value}, consensus={output.consensus_achieved}",
            execution_time_ms=execution_time,
        )

        return AgentResult(
            output=output,
            reasoning=output.reasoning,
            execution_time_ms=execution_time,
            metadata={
                "contribution_id": str(input.contribution.id),
                "claim_id": str(input.claim.id),
                "trigger": input.trigger,
                "used_consensus": needs_consensus and self._use_multi_model,
            },
        )

    def _needs_multi_model_consensus(self, input: ArbitrationInput) -> bool:
        """Determine if this arbitration needs multi-model consensus."""
        # High-stakes scenarios that need consensus
        if input.trigger == "appeal":
            return True  # Appeals always get consensus

        # Claims with many dependents
        if len(input.claim_history) > 10:
            return True

        # Multiple conflicting contributions
        if len(input.conflicting_contributions) > 2:
            return True

        return False

    async def _arbitrate_single_model(
        self,
        user_prompt: str,
        input: ArbitrationInput,
    ) -> ArbitrationOutput:
        """Arbitrate using a single model."""
        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        output = self._parse_response(result.content)
        output.consensus_achieved = True
        output.model_votes = {self._config.model or "default": output.decision}

        return output

    async def _arbitrate_with_consensus(
        self,
        user_prompt: str,
        input: ArbitrationInput,
    ) -> ArbitrationOutput:
        """Arbitrate using multi-model consensus."""
        # Use both the standard governance model and the arbitration model
        models = [
            self._settings.llm.governance_model,
            self._settings.llm.arbitration_model,
        ]

        model_outputs = {}
        primary_output = None

        for model in models:
            result = await self._client.complete(
                messages=[{"role": "user", "content": user_prompt}],
                system=self.get_system_prompt(),
                model=model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )

            output = self._parse_response(result.content)
            model_outputs[model] = output

            if primary_output is None:
                primary_output = output

        # Check for consensus
        decisions = [o.outcome for o in model_outputs.values()]
        consensus = len(set(d.value for d in decisions)) == 1

        # Build final output
        if consensus:
            # Use the primary output but note consensus
            final_output = primary_output
            final_output.consensus_achieved = True
            final_output.model_votes = {
                m: o.decision for m, o in model_outputs.items()
            }
        else:
            # No consensus - mark as contested or recommend human review
            final_output = ArbitrationOutput(
                outcome=ArbitrationOutcome.MARK_CONTESTED,
                decision="No consensus reached between models",
                reasoning=self._format_disagreement(model_outputs),
                policy_citations=list(set(
                    p for o in model_outputs.values()
                    for p in o.policy_citations
                )),
                evidence_summary="See individual model analyses",
                precedent_notes="",
                consensus_achieved=False,
                model_votes={m: o.decision for m, o in model_outputs.items()},
                confidence=0.5,
                human_review_recommended=True,
            )

        return final_output

    def _format_disagreement(self, outputs: dict[str, ArbitrationOutput]) -> str:
        """Format the model disagreement for the reasoning."""
        parts = ["Models did not reach consensus:\n"]
        for model, output in outputs.items():
            parts.append(f"\n**{model}**:")
            parts.append(f"- Outcome: {output.outcome.value}")
            parts.append(f"- Decision: {output.decision[:200]}...")
        return "\n".join(parts)

    def _build_escalated_review_prompt(self, input: ArbitrationInput) -> str:
        """Build prompt for escalated review."""
        contribution_dict = {
            "type": input.contribution.contribution_type.value,
            "content": input.contribution.content,
            "evidence_urls": input.contribution.evidence_urls,
            "contributor_trust": "unknown",
        }
        claim_dict = {
            "id": str(input.claim.id),
            "canonical_form": input.claim.canonical_form,
            "status": input.claim.state.value,
            "dependent_count": len(input.claim_history),
        }
        return DisputeArbitratorPrompts.get_escalated_review_prompt(
            contribution=contribution_dict,
            claim=claim_dict,
            reviewer_notes=input.reviewer_notes,
            escalation_reason=input.escalation_reason,
            claim_history=input.claim_history,
        )

    def _build_appeal_prompt(self, input: ArbitrationInput) -> str:
        """Build prompt for appeal."""
        if not input.original_review or not input.appeal:
            raise ValueError("Appeal requires original_review and appeal")

        contribution_dict = {
            "type": input.contribution.contribution_type.value,
            "content": input.contribution.content,
            "evidence_urls": input.contribution.evidence_urls,
        }
        review_dict = {
            "reasoning": input.original_review.reasoning,
            "policy_citations": input.original_review.policy_citations,
            "reviewed_by": input.original_review.reviewed_by,
        }
        appeal_dict = {
            "appellant_id": input.appeal.appellant_id,
            "appeal_reasoning": input.appeal.appeal_reasoning,
            "submitted_at": input.appeal.submitted_at.isoformat(),
        }
        claim_dict = {
            "canonical_form": input.claim.canonical_form,
            "status": input.claim.state.value,
        }
        return DisputeArbitratorPrompts.get_appeal_prompt(
            contribution=contribution_dict,
            original_review=review_dict,
            appeal=appeal_dict,
            claim=claim_dict,
        )

    def _build_conflict_prompt(self, input: ArbitrationInput) -> str:
        """Build prompt for conflict resolution."""
        claim_dict = {
            "id": str(input.claim.id),
            "canonical_form": input.claim.canonical_form,
            "status": input.claim.state.value,
            "dependent_count": len(input.claim_history),
        }
        contributions = []
        for c in input.conflicting_contributions:
            contributions.append({
                "type": c.contribution_type.value,
                "content": c.content,
                "evidence_urls": c.evidence_urls,
                "contributor_trust": "unknown",
                "contributor_rep": 50.0,
            })
        return DisputeArbitratorPrompts.get_conflict_resolution_prompt(
            claim=claim_dict,
            contributions=contributions,
        )

    def _parse_response(self, response: str) -> ArbitrationOutput:
        """Parse the LLM response into an arbitration output."""
        response_lower = response.lower()

        # Determine outcome
        if "human_review" in response_lower or "human review" in response_lower:
            outcome = ArbitrationOutcome.HUMAN_REVIEW
        elif "contested" in response_lower and "mark" in response_lower:
            outcome = ArbitrationOutcome.MARK_CONTESTED
        else:
            outcome = ArbitrationOutcome.RESOLVED

        # Determine decision (accept or reject the original contribution)
        if "accept" in response_lower and "original" not in response_lower:
            decision = "Accept the contribution"
        elif "reject" in response_lower or "uphold" in response_lower:
            decision = "Reject the contribution (uphold original decision)"
        elif "overturn" in response_lower:
            decision = "Overturn the original decision"
        else:
            decision = "See detailed reasoning"

        # Extract confidence
        import re
        confidence = 0.7
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
                      "no original research", "charitable interpretation", "explicit uncertainty",
                      "process over outcome"]:
            if policy in response_lower:
                policy_citations.append(policy.upper().replace(" ", "_"))

        # Check for human review recommendation
        human_review = (
            "human review" in response_lower and "recommend" in response_lower
        ) or outcome == ArbitrationOutcome.HUMAN_REVIEW

        return ArbitrationOutput(
            outcome=outcome,
            decision=decision,
            reasoning=response,
            policy_citations=policy_citations,
            evidence_summary="See reasoning for evidence analysis",
            precedent_notes="",
            consensus_achieved=True,  # Will be updated if multi-model
            model_votes={},  # Will be updated if multi-model
            confidence=confidence,
            human_review_recommended=human_review,
        )

    def create_arbitration_record(
        self,
        contribution: Contribution,
        appeal: Appeal | None,
        output: ArbitrationOutput,
    ) -> ArbitrationResult:
        """Create an ArbitrationResult record from the output.

        Args:
            contribution: The contribution being arbitrated
            appeal: The appeal (if this is an appeal arbitration)
            output: The arbitration output

        Returns:
            ArbitrationResult record ready for storage
        """
        return ArbitrationResult(
            contribution_id=contribution.id,
            appeal_id=appeal.id if appeal else None,
            outcome=output.outcome,
            decision=output.decision,
            reasoning=output.reasoning,
            consensus_achieved=output.consensus_achieved,
            model_votes=output.model_votes,
            human_review_recommended=output.human_review_recommended,
            arbitrated_by="dispute_arbitrator",
        )
