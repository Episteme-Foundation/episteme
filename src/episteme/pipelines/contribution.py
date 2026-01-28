"""Contribution pipeline for processing contributions.

The contribution pipeline orchestrates:
1. Receiving and validating contributions
2. Checking contributor rate limits
3. Routing contributions to the reviewer
4. Handling accept/reject/escalate decisions
5. Integrating accepted contributions via the claim steward
6. Recording all decisions for audit
"""

import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim
from episteme.domain.contribution import Contribution, ContributionReview
from episteme.domain.contributor import Contributor, ContributorRateLimits
from episteme.domain.enums import ContributionType, ReviewDecision
from episteme.llm.agents.contribution_reviewer import ContributionReviewerAgent, ReviewInput, ReviewOutput
from episteme.llm.agents.claim_steward import ClaimStewardAgent, StewardshipInput
from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class ContributionStats:
    """Statistics from contribution processing."""

    contributions_received: int = 0
    contributions_accepted: int = 0
    contributions_rejected: int = 0
    contributions_escalated: int = 0
    rate_limit_exceeded: int = 0
    stewardship_actions: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class ContributionPipelineResult:
    """Result from the contribution pipeline."""

    contribution_id: UUID
    decision: ReviewDecision | None
    review: ContributionReview | None
    stats: ContributionStats
    processing_time_ms: float = 0.0
    escalated_to_arbitration: bool = False
    stewardship_action: str | None = None


@dataclass
class PipelineConfig:
    """Configuration for the contribution pipeline."""

    enable_rate_limiting: bool = True
    enable_audit_sampling: bool = True
    audit_sample_rate: float = 0.05  # 5% of decisions
    auto_accept_threshold: float = 0.95
    auto_reject_threshold: float = 0.95
    escalation_threshold: float = 0.7


class ContributionPipeline:
    """Pipeline for processing contributions to the knowledge graph.

    Orchestrates the full contribution flow:

    1. **Validate**: Check contribution format and rate limits
    2. **Review**: Send to ContributionReviewer for evaluation
    3. **Decide**: Accept, reject, or escalate based on review
    4. **Integrate**: For accepted contributions, trigger claim steward
    5. **Record**: Store all decisions for transparency and audit

    Example:
        ```python
        pipeline = ContributionPipeline(
            repository=claim_repo,
            reviewer=reviewer_agent,
            steward=steward_agent,
        )

        result = await pipeline.process_contribution(
            contribution=contribution,
            claim=claim,
            contributor=contributor,
        )

        if result.decision == ReviewDecision.ACCEPT:
            print(f"Contribution accepted: {result.stewardship_action}")
        ```
    """

    def __init__(
        self,
        repository: ClaimRepository,
        reviewer: ContributionReviewerAgent | None = None,
        steward: ClaimStewardAgent | None = None,
        config: PipelineConfig | None = None,
    ) -> None:
        """Initialize the pipeline.

        Args:
            repository: Repository for claim storage
            reviewer: ContributionReviewer agent (creates one if not provided)
            steward: ClaimSteward agent (creates one if not provided)
            config: Pipeline configuration
        """
        self._repository = repository
        self._reviewer = reviewer or ContributionReviewerAgent()
        self._steward = steward or ClaimStewardAgent()
        self._config = config or PipelineConfig()
        self._settings = get_settings()

    async def process_contribution(
        self,
        contribution: Contribution,
        claim: Claim,
        contributor: Contributor,
        existing_evidence: list[dict] | None = None,
        merge_target_claim: Claim | None = None,
    ) -> ContributionPipelineResult:
        """Process a contribution through the pipeline.

        Args:
            contribution: The contribution to process
            claim: The target claim
            contributor: The contributor
            existing_evidence: Existing evidence for challenges
            merge_target_claim: Target claim for merge proposals

        Returns:
            ContributionPipelineResult with the outcome
        """
        start_time = time.time()
        stats = ContributionStats(contributions_received=1)

        logger.info(
            "Processing contribution",
            contribution_id=str(contribution.id),
            claim_id=str(claim.id),
            contributor_id=contributor.id,
            contribution_type=contribution.contribution_type.value,
        )

        try:
            # Step 1: Check rate limits
            if self._config.enable_rate_limiting:
                rate_ok = await self._check_rate_limit(contributor)
                if not rate_ok:
                    stats.rate_limit_exceeded = 1
                    return ContributionPipelineResult(
                        contribution_id=contribution.id,
                        decision=ReviewDecision.REJECT,
                        review=ContributionReview(
                            contribution_id=contribution.id,
                            decision=ReviewDecision.REJECT,
                            reasoning="Rate limit exceeded. Please wait before submitting more contributions.",
                            confidence=1.0,
                            policy_citations=["RATE_LIMITING"],
                            reviewed_by="contribution_pipeline",
                        ),
                        stats=stats,
                        processing_time_ms=(time.time() - start_time) * 1000,
                    )

            # Step 2: Review the contribution
            review_input = ReviewInput(
                contribution=contribution,
                claim=claim,
                contributor=contributor,
                existing_evidence=existing_evidence or [],
                merge_target_claim=merge_target_claim,
            )

            review_result = await self._reviewer.execute(review_input)
            review_output = review_result.output

            # Step 3: Create review record
            review = self._reviewer.create_review_record(contribution, review_output)

            # Step 4: Handle the decision
            if review_output.decision == ReviewDecision.ACCEPT:
                stats.contributions_accepted = 1

                # Trigger stewardship
                stewardship_action = await self._handle_accepted_contribution(
                    contribution, claim, review
                )
                stats.stewardship_actions = 1 if stewardship_action else 0

                # Update contributor record
                contributor.record_contribution_result(accepted=True)

            elif review_output.decision == ReviewDecision.REJECT:
                stats.contributions_rejected = 1
                contributor.record_contribution_result(accepted=False)
                stewardship_action = None

            else:  # ESCALATE
                stats.contributions_escalated = 1
                contributor.record_contribution_result(accepted=False, escalated=True)
                stewardship_action = None

            # Step 5: Store the review
            await self._store_review(review)

            processing_time = (time.time() - start_time) * 1000

            logger.info(
                "Contribution processed",
                contribution_id=str(contribution.id),
                decision=review_output.decision.value,
                confidence=review_output.confidence,
                processing_time_ms=processing_time,
            )

            return ContributionPipelineResult(
                contribution_id=contribution.id,
                decision=review_output.decision,
                review=review,
                stats=stats,
                processing_time_ms=processing_time,
                escalated_to_arbitration=review_output.decision == ReviewDecision.ESCALATE,
                stewardship_action=stewardship_action,
            )

        except Exception as e:
            logger.error(
                "Error processing contribution",
                contribution_id=str(contribution.id),
                error=str(e),
            )
            stats.errors.append(str(e))
            return ContributionPipelineResult(
                contribution_id=contribution.id,
                decision=None,
                review=None,
                stats=stats,
                processing_time_ms=(time.time() - start_time) * 1000,
            )

    async def _check_rate_limit(self, contributor: Contributor) -> bool:
        """Check if contributor is within rate limits.

        Args:
            contributor: The contributor

        Returns:
            True if within limits, False if exceeded
        """
        limits = contributor.get_rate_limits()

        # In a real implementation, this would check actual counts
        # from a time-windowed counter (e.g., Redis)
        # For now, just return True
        return True

    async def _handle_accepted_contribution(
        self,
        contribution: Contribution,
        claim: Claim,
        review: ContributionReview,
    ) -> str | None:
        """Handle an accepted contribution by triggering stewardship.

        Args:
            contribution: The accepted contribution
            claim: The target claim
            review: The review decision

        Returns:
            The stewardship action taken, if any
        """
        # Trigger the claim steward
        steward_input = StewardshipInput(
            claim=claim,
            trigger="contribution_accepted",
            context={
                "contribution": {
                    "type": contribution.contribution_type.value,
                    "content": contribution.content,
                    "evidence_urls": contribution.evidence_urls,
                    "proposed_canonical_form": contribution.proposed_canonical_form,
                },
                "review_decision": {
                    "reasoning": review.reasoning,
                    "actions": review.actions_if_accepted,
                },
                "current_status": claim.state.value,
            },
        )

        result = await self._steward.execute(steward_input)
        return result.output.action

    async def _store_review(self, review: ContributionReview) -> None:
        """Store a review decision.

        Args:
            review: The review to store
        """
        # In a real implementation, this would store to the database
        # await self._repository.store_contribution_review(review)
        pass

    async def process_batch(
        self,
        contributions: list[tuple[Contribution, Claim, Contributor]],
    ) -> list[ContributionPipelineResult]:
        """Process multiple contributions.

        Args:
            contributions: List of (contribution, claim, contributor) tuples

        Returns:
            List of results
        """
        results = []
        for contribution, claim, contributor in contributions:
            result = await self.process_contribution(contribution, claim, contributor)
            results.append(result)
        return results

    async def get_queue_statistics(self) -> dict[str, Any]:
        """Get statistics about the contribution queue.

        Returns:
            Dictionary of queue statistics
        """
        # In a real implementation, this would query the database
        return {
            "pending_count": 0,
            "escalated_count": 0,
            "avg_processing_time_ms": 0.0,
            "acceptance_rate": 0.0,
        }
