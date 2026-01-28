"""Arbitration pipeline for handling disputes and appeals.

The arbitration pipeline orchestrates:
1. Receiving escalated reviews and appeals
2. Gathering full context for arbitration
3. Routing to the Dispute Arbitrator
4. Handling multi-model consensus when needed
5. Implementing arbitration decisions
6. Recording all decisions for audit
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
from episteme.llm.agents.dispute_arbitrator import (
    DisputeArbitratorAgent,
    ArbitrationInput,
    ArbitrationOutput,
)
from episteme.llm.agents.claim_steward import ClaimStewardAgent, StewardshipInput
from episteme.llm.agents.audit_agent import AuditAgent, AuditInput
from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class ArbitrationStats:
    """Statistics from arbitration processing."""

    cases_received: int = 0
    cases_resolved: int = 0
    cases_marked_contested: int = 0
    cases_human_review: int = 0
    appeals_processed: int = 0
    appeals_upheld: int = 0
    appeals_overturned: int = 0
    consensus_achieved: int = 0
    consensus_failed: int = 0
    stewardship_actions: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class ArbitrationPipelineResult:
    """Result from the arbitration pipeline."""

    contribution_id: UUID
    appeal_id: UUID | None
    outcome: ArbitrationOutcome | None
    arbitration_result: ArbitrationResult | None
    stats: ArbitrationStats
    processing_time_ms: float = 0.0
    human_review_flagged: bool = False
    stewardship_action: str | None = None


@dataclass
class PipelineConfig:
    """Configuration for the arbitration pipeline."""

    use_multi_model_consensus: bool = True
    require_consensus_for_appeals: bool = True
    audit_all_arbitrations: bool = True
    human_review_confidence_threshold: float = 0.5


class ArbitrationPipeline:
    """Pipeline for handling escalated disputes and appeals.

    Orchestrates the full arbitration flow:

    1. **Gather context**: Collect full claim history and related data
    2. **Arbitrate**: Send to DisputeArbitrator for decision
    3. **Verify consensus**: For high-stakes cases, verify with multi-model
    4. **Implement**: Execute the arbitration decision
    5. **Audit**: Record and optionally audit the decision

    Example:
        ```python
        pipeline = ArbitrationPipeline(
            repository=claim_repo,
            arbitrator=arbitrator_agent,
            steward=steward_agent,
        )

        # Handle an escalated review
        result = await pipeline.arbitrate_escalated_review(
            contribution=contribution,
            claim=claim,
            review_notes="Low confidence in original decision",
        )

        # Handle an appeal
        result = await pipeline.handle_appeal(
            contribution=contribution,
            claim=claim,
            original_review=review,
            appeal=appeal,
        )
        ```
    """

    def __init__(
        self,
        repository: ClaimRepository,
        arbitrator: DisputeArbitratorAgent | None = None,
        steward: ClaimStewardAgent | None = None,
        auditor: AuditAgent | None = None,
        config: PipelineConfig | None = None,
    ) -> None:
        """Initialize the pipeline.

        Args:
            repository: Repository for claim storage
            arbitrator: DisputeArbitrator agent (creates one if not provided)
            steward: ClaimSteward agent (creates one if not provided)
            auditor: AuditAgent (creates one if not provided)
            config: Pipeline configuration
        """
        self._repository = repository
        self._arbitrator = arbitrator or DisputeArbitratorAgent()
        self._steward = steward or ClaimStewardAgent()
        self._auditor = auditor or AuditAgent()
        self._config = config or PipelineConfig()
        self._settings = get_settings()

    async def arbitrate_escalated_review(
        self,
        contribution: Contribution,
        claim: Claim,
        review_notes: str,
        escalation_reason: str,
    ) -> ArbitrationPipelineResult:
        """Arbitrate an escalated contribution review.

        Args:
            contribution: The escalated contribution
            claim: The target claim
            review_notes: Notes from the reviewer who escalated
            escalation_reason: Why it was escalated

        Returns:
            ArbitrationPipelineResult with the outcome
        """
        start_time = time.time()
        stats = ArbitrationStats(cases_received=1)

        logger.info(
            "Arbitrating escalated review",
            contribution_id=str(contribution.id),
            claim_id=str(claim.id),
            escalation_reason=escalation_reason,
        )

        try:
            # Gather claim history
            claim_history = await self._gather_claim_history(claim.id)

            # Build arbitration input
            arb_input = ArbitrationInput(
                contribution=contribution,
                claim=claim,
                trigger="escalated_review",
                reviewer_notes=review_notes,
                escalation_reason=escalation_reason,
                claim_history=claim_history,
            )

            # Execute arbitration
            arb_result = await self._arbitrator.execute(arb_input)
            arb_output = arb_result.output

            # Update stats based on outcome
            self._update_stats_for_outcome(stats, arb_output)

            # Create arbitration record
            arbitration_record = self._arbitrator.create_arbitration_record(
                contribution=contribution,
                appeal=None,
                output=arb_output,
            )

            # Handle the outcome
            stewardship_action = None
            if arb_output.outcome == ArbitrationOutcome.RESOLVED:
                if "accept" in arb_output.decision.lower():
                    # Implement the accepted contribution
                    stewardship_action = await self._implement_accepted_contribution(
                        contribution, claim, arb_output
                    )
                    stats.stewardship_actions = 1

            # Store the arbitration result
            await self._store_arbitration_result(arbitration_record)

            # Audit if configured
            if self._config.audit_all_arbitrations:
                await self._audit_arbitration(arbitration_record, contribution, claim)

            processing_time = (time.time() - start_time) * 1000

            logger.info(
                "Arbitration completed",
                contribution_id=str(contribution.id),
                outcome=arb_output.outcome.value,
                consensus=arb_output.consensus_achieved,
                processing_time_ms=processing_time,
            )

            return ArbitrationPipelineResult(
                contribution_id=contribution.id,
                appeal_id=None,
                outcome=arb_output.outcome,
                arbitration_result=arbitration_record,
                stats=stats,
                processing_time_ms=processing_time,
                human_review_flagged=arb_output.human_review_recommended,
                stewardship_action=stewardship_action,
            )

        except Exception as e:
            logger.error(
                "Error in arbitration",
                contribution_id=str(contribution.id),
                error=str(e),
            )
            stats.errors.append(str(e))
            return ArbitrationPipelineResult(
                contribution_id=contribution.id,
                appeal_id=None,
                outcome=None,
                arbitration_result=None,
                stats=stats,
                processing_time_ms=(time.time() - start_time) * 1000,
            )

    async def handle_appeal(
        self,
        contribution: Contribution,
        claim: Claim,
        original_review: ContributionReview,
        appeal: Appeal,
    ) -> ArbitrationPipelineResult:
        """Handle an appeal of a rejected contribution.

        Args:
            contribution: The original contribution
            claim: The target claim
            original_review: The rejection decision being appealed
            appeal: The appeal

        Returns:
            ArbitrationPipelineResult with the outcome
        """
        start_time = time.time()
        stats = ArbitrationStats(cases_received=1, appeals_processed=1)

        logger.info(
            "Handling appeal",
            contribution_id=str(contribution.id),
            appeal_id=str(appeal.id),
            claim_id=str(claim.id),
        )

        try:
            # Build arbitration input
            arb_input = ArbitrationInput(
                contribution=contribution,
                claim=claim,
                trigger="appeal",
                original_review=original_review,
                appeal=appeal,
            )

            # Execute arbitration (appeals always use consensus if configured)
            arb_result = await self._arbitrator.execute(arb_input)
            arb_output = arb_result.output

            # Determine if appeal was upheld or overturned
            appeal_overturned = (
                arb_output.outcome == ArbitrationOutcome.RESOLVED and
                "overturn" in arb_output.decision.lower()
            )

            if appeal_overturned:
                stats.appeals_overturned = 1
            else:
                stats.appeals_upheld = 1

            # Update consensus stats
            if arb_output.consensus_achieved:
                stats.consensus_achieved = 1
            else:
                stats.consensus_failed = 1

            # Update outcome stats
            self._update_stats_for_outcome(stats, arb_output)

            # Create arbitration record
            arbitration_record = self._arbitrator.create_arbitration_record(
                contribution=contribution,
                appeal=appeal,
                output=arb_output,
            )

            # Handle the outcome
            stewardship_action = None
            if appeal_overturned:
                # Implement the now-accepted contribution
                stewardship_action = await self._implement_accepted_contribution(
                    contribution, claim, arb_output
                )
                stats.stewardship_actions = 1

            # Update appeal status
            appeal.status = "resolved"
            appeal.resolution_id = arbitration_record.id

            # Store the arbitration result
            await self._store_arbitration_result(arbitration_record)

            # Audit appeals
            if self._config.audit_all_arbitrations:
                await self._audit_arbitration(arbitration_record, contribution, claim)

            processing_time = (time.time() - start_time) * 1000

            logger.info(
                "Appeal processed",
                appeal_id=str(appeal.id),
                outcome=arb_output.outcome.value,
                overturned=appeal_overturned,
                processing_time_ms=processing_time,
            )

            return ArbitrationPipelineResult(
                contribution_id=contribution.id,
                appeal_id=appeal.id,
                outcome=arb_output.outcome,
                arbitration_result=arbitration_record,
                stats=stats,
                processing_time_ms=processing_time,
                human_review_flagged=arb_output.human_review_recommended,
                stewardship_action=stewardship_action,
            )

        except Exception as e:
            logger.error(
                "Error handling appeal",
                appeal_id=str(appeal.id),
                error=str(e),
            )
            stats.errors.append(str(e))
            return ArbitrationPipelineResult(
                contribution_id=contribution.id,
                appeal_id=appeal.id,
                outcome=None,
                arbitration_result=None,
                stats=stats,
                processing_time_ms=(time.time() - start_time) * 1000,
            )

    async def resolve_conflicts(
        self,
        claim: Claim,
        conflicting_contributions: list[Contribution],
    ) -> ArbitrationPipelineResult:
        """Resolve conflicting contributions on a claim.

        Args:
            claim: The claim with conflicts
            conflicting_contributions: List of conflicting contributions

        Returns:
            ArbitrationPipelineResult with the outcome
        """
        start_time = time.time()
        stats = ArbitrationStats(cases_received=1)

        logger.info(
            "Resolving conflicts",
            claim_id=str(claim.id),
            conflict_count=len(conflicting_contributions),
        )

        try:
            # Gather claim history
            claim_history = await self._gather_claim_history(claim.id)

            # Build arbitration input
            arb_input = ArbitrationInput(
                contribution=conflicting_contributions[0],  # Primary contribution
                claim=claim,
                trigger="conflict_resolution",
                claim_history=claim_history,
                conflicting_contributions=conflicting_contributions,
            )

            # Execute arbitration
            arb_result = await self._arbitrator.execute(arb_input)
            arb_output = arb_result.output

            # Update stats
            self._update_stats_for_outcome(stats, arb_output)

            # Create arbitration record
            arbitration_record = self._arbitrator.create_arbitration_record(
                contribution=conflicting_contributions[0],
                appeal=None,
                output=arb_output,
            )

            # Store the result
            await self._store_arbitration_result(arbitration_record)

            processing_time = (time.time() - start_time) * 1000

            return ArbitrationPipelineResult(
                contribution_id=conflicting_contributions[0].id,
                appeal_id=None,
                outcome=arb_output.outcome,
                arbitration_result=arbitration_record,
                stats=stats,
                processing_time_ms=processing_time,
                human_review_flagged=arb_output.human_review_recommended,
            )

        except Exception as e:
            logger.error(
                "Error resolving conflicts",
                claim_id=str(claim.id),
                error=str(e),
            )
            stats.errors.append(str(e))
            return ArbitrationPipelineResult(
                contribution_id=conflicting_contributions[0].id,
                appeal_id=None,
                outcome=None,
                arbitration_result=None,
                stats=stats,
                processing_time_ms=(time.time() - start_time) * 1000,
            )

    def _update_stats_for_outcome(
        self,
        stats: ArbitrationStats,
        output: ArbitrationOutput,
    ) -> None:
        """Update stats based on arbitration outcome."""
        if output.outcome == ArbitrationOutcome.RESOLVED:
            stats.cases_resolved = 1
        elif output.outcome == ArbitrationOutcome.MARK_CONTESTED:
            stats.cases_marked_contested = 1
        elif output.outcome == ArbitrationOutcome.HUMAN_REVIEW:
            stats.cases_human_review = 1

        if output.consensus_achieved:
            stats.consensus_achieved = 1
        else:
            stats.consensus_failed = 1

    async def _gather_claim_history(self, claim_id: UUID) -> list[dict]:
        """Gather claim history for context.

        Args:
            claim_id: The claim ID

        Returns:
            List of history entries
        """
        # In a real implementation, this would query the database
        # For now, return empty list
        return []

    async def _implement_accepted_contribution(
        self,
        contribution: Contribution,
        claim: Claim,
        arb_output: ArbitrationOutput,
    ) -> str | None:
        """Implement an accepted contribution via stewardship.

        Args:
            contribution: The contribution to implement
            claim: The target claim
            arb_output: The arbitration output

        Returns:
            The stewardship action taken
        """
        steward_input = StewardshipInput(
            claim=claim,
            trigger="contribution_accepted",
            context={
                "contribution": {
                    "type": contribution.contribution_type.value,
                    "content": contribution.content,
                    "evidence_urls": contribution.evidence_urls,
                },
                "review_decision": {
                    "reasoning": arb_output.reasoning[:500],
                    "actions": [],
                },
                "current_status": claim.state.value,
            },
        )

        result = await self._steward.execute(steward_input)
        return result.output.action

    async def _store_arbitration_result(
        self,
        result: ArbitrationResult,
    ) -> None:
        """Store an arbitration result.

        Args:
            result: The result to store
        """
        # In a real implementation, this would store to the database
        pass

    async def _audit_arbitration(
        self,
        arbitration: ArbitrationResult,
        contribution: Contribution,
        claim: Claim,
    ) -> None:
        """Audit an arbitration decision.

        Args:
            arbitration: The arbitration to audit
            contribution: The contribution
            claim: The claim
        """
        audit_input = AuditInput(
            audit_type="decision_audit",
            decision=arbitration,
            contribution={
                "type": contribution.contribution_type.value,
                "content": contribution.content,
            },
            claim={
                "canonical_form": claim.canonical_form,
                "status": claim.state.value,
            },
            contributor={},
        )

        await self._auditor.execute(audit_input)
