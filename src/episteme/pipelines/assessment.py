"""Assessment pipeline for evaluating claim validity.

The assessment pipeline orchestrates:
1. Traversing claim decomposition trees bottom-up
2. Assessing atomic claims based on source evidence
3. Aggregating subclaim assessments for compound claims
4. Propagating assessment changes to parent claims
5. Storing assessments with full reasoning traces

This is the third stage after decomposition, determining the validity
status of claims based on their dependency structure.
"""

import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim, ClaimTree
from episteme.domain.assessment import Assessment, AssessmentChange
from episteme.domain.enums import AssessmentStatus
from episteme.llm.agents.assessor import AssessorAgent, AssessmentInput
from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class AssessmentStats:
    """Statistics from an assessment run."""

    claims_assessed: int = 0
    verified_count: int = 0
    contested_count: int = 0
    unsupported_count: int = 0
    unknown_count: int = 0
    propagations_triggered: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class AssessmentPipelineResult:
    """Result from the assessment pipeline."""

    root_claim_id: UUID
    root_assessment: Assessment | None
    stats: AssessmentStats
    processing_time_ms: float = 0.0
    assessments: dict[UUID, Assessment] = field(default_factory=dict)


@dataclass
class PropagationResult:
    """Result from propagating an assessment change."""

    trigger_claim_id: UUID
    claims_reassessed: int = 0
    changes: list[AssessmentChange] = field(default_factory=list)


@dataclass
class PipelineConfig:
    """Configuration for the assessment pipeline."""

    max_tree_depth: int = 10
    propagate_changes: bool = True
    reassess_existing: bool = False
    min_confidence_for_verified: float = 0.7


class AssessmentPipeline:
    """Pipeline for assessing claim validity.

    Orchestrates the assessment of claims through their decomposition trees:

    1. **Traverse**: Walk the tree bottom-up (post-order)
    2. **Assess leaves**: Evaluate atomic claims based on evidence
    3. **Aggregate**: Combine subclaim assessments for compound claims
    4. **Store**: Persist assessments with reasoning traces
    5. **Propagate**: Re-assess parent claims when subclaims change

    Example:
        ```python
        pipeline = AssessmentPipeline(repository=claim_repo)

        result = await pipeline.assess_claim(claim_id)

        print(f"Status: {result.root_assessment.status}")
        print(f"Assessed {result.stats.claims_assessed} claims")
        ```
    """

    def __init__(
        self,
        repository: ClaimRepository,
        assessor: AssessorAgent | None = None,
        config: PipelineConfig | None = None,
    ) -> None:
        """Initialize the assessment pipeline.

        Args:
            repository: Claim repository for storage operations
            assessor: Assessor agent (creates one if not provided)
            config: Pipeline configuration
        """
        self._repository = repository
        self._assessor = assessor or AssessorAgent()
        self._config = config or PipelineConfig()
        self._settings = get_settings()

    async def assess_claim(
        self,
        claim_id: UUID,
        force_reassess: bool = False,
    ) -> AssessmentPipelineResult:
        """Assess a claim and all its subclaims.

        Args:
            claim_id: ID of the claim to assess
            force_reassess: Whether to reassess even if already assessed

        Returns:
            AssessmentPipelineResult with all assessments
        """
        start_time = time.time()

        # Get the claim tree
        tree = await self._repository.get_claim_tree(
            claim_id,
            max_depth=self._config.max_tree_depth,
        )

        if tree is None:
            return AssessmentPipelineResult(
                root_claim_id=claim_id,
                root_assessment=None,
                stats=AssessmentStats(errors=["Claim not found"]),
            )

        stats = AssessmentStats()
        assessments: dict[UUID, Assessment] = {}

        # Load existing assessments if not forcing reassess
        if not force_reassess and not self._config.reassess_existing:
            assessments = await self._load_existing_assessments(tree)

        # Assess the tree bottom-up
        root_assessment = await self._assess_tree(
            tree=tree,
            assessments=assessments,
            stats=stats,
            force_reassess=force_reassess,
        )

        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            "Assessment pipeline complete",
            root_claim_id=str(claim_id),
            claims_assessed=stats.claims_assessed,
            verified=stats.verified_count,
            contested=stats.contested_count,
            unsupported=stats.unsupported_count,
            processing_time_ms=processing_time_ms,
        )

        return AssessmentPipelineResult(
            root_claim_id=claim_id,
            root_assessment=root_assessment,
            stats=stats,
            processing_time_ms=processing_time_ms,
            assessments=assessments,
        )

    async def _load_existing_assessments(
        self,
        tree: ClaimTree,
    ) -> dict[UUID, Assessment]:
        """Load existing assessments for all claims in the tree."""
        assessments: dict[UUID, Assessment] = {}
        all_claims = tree.get_all_claims()

        for claim in all_claims:
            existing = await self._repository.get_current_assessment(claim.id)
            if existing:
                assessments[claim.id] = existing

        logger.debug(
            "Loaded existing assessments",
            total_claims=len(all_claims),
            existing_assessments=len(assessments),
        )

        return assessments

    async def _assess_tree(
        self,
        tree: ClaimTree,
        assessments: dict[UUID, Assessment],
        stats: AssessmentStats,
        force_reassess: bool,
    ) -> Assessment:
        """Assess a claim tree bottom-up (post-order traversal)."""
        # First, assess all children
        subclaim_assessments: list[tuple[Claim, Assessment | None, str]] = []

        for child_tree, decomposition in tree.children:
            if child_tree.claim.id not in assessments or force_reassess:
                child_assessment = await self._assess_tree(
                    tree=child_tree,
                    assessments=assessments,
                    stats=stats,
                    force_reassess=force_reassess,
                )
            else:
                child_assessment = assessments[child_tree.claim.id]

            subclaim_assessments.append((
                child_tree.claim,
                child_assessment,
                decomposition.relation.value,
            ))

        # Check if we already have an assessment and don't need to reassess
        if tree.claim.id in assessments and not force_reassess:
            return assessments[tree.claim.id]

        # Assess this claim
        try:
            # Get instances for atomic claims
            instances = None
            if tree.is_leaf:
                instance_models = await self._repository.get_instances_for_claim(tree.claim.id)
                instances = [
                    {
                        "source_title": "Source",  # Would need to join with source
                        "source_type": "unknown",
                        "original_text": inst.original_text,
                        "confidence": inst.confidence,
                    }
                    for inst in instance_models
                ]

            result = await self._assessor.execute(AssessmentInput(
                claim=tree.claim,
                subclaim_assessments=subclaim_assessments,
                instances=instances,
                is_atomic=tree.is_leaf,
            ))

            assessment = result.output
            stats.claims_assessed += 1

            # Update status counts
            if assessment.status == AssessmentStatus.VERIFIED:
                stats.verified_count += 1
            elif assessment.status == AssessmentStatus.CONTESTED:
                stats.contested_count += 1
            elif assessment.status == AssessmentStatus.UNSUPPORTED:
                stats.unsupported_count += 1
            else:
                stats.unknown_count += 1

            # Store the assessment
            await self._repository.add_assessment(assessment)
            assessments[tree.claim.id] = assessment

            return assessment

        except Exception as e:
            error_msg = f"Assessment failed for {tree.claim.id}: {str(e)}"
            stats.errors.append(error_msg)
            logger.error("Assessment failed", claim_id=str(tree.claim.id), error=str(e))

            # Create a fallback unknown assessment
            fallback = Assessment(
                claim_id=tree.claim.id,
                status=AssessmentStatus.UNKNOWN,
                confidence=0.0,
                reasoning_trace=f"Assessment failed: {str(e)}",
                assessed_by="assessment_pipeline",
            )
            assessments[tree.claim.id] = fallback
            return fallback

    async def propagate_change(
        self,
        claim_id: UUID,
        trigger: str = "subclaim_change",
    ) -> PropagationResult:
        """Propagate an assessment change to parent claims.

        When a claim's assessment changes, all parent claims may need
        to be reassessed since their status depends on subclaims.

        Args:
            claim_id: ID of the claim whose assessment changed
            trigger: What triggered the propagation

        Returns:
            PropagationResult with reassessment details
        """
        result = PropagationResult(trigger_claim_id=claim_id)

        if not self._config.propagate_changes:
            return result

        # Get all parent claims
        parents = await self._repository.get_parent_claims(claim_id)

        for parent_claim, decomposition in parents:
            try:
                # Get current assessment
                current = await self._repository.get_current_assessment(parent_claim.id)

                # Get all subclaims and their assessments
                subclaims = await self._repository.get_subclaims(parent_claim.id)
                subclaim_assessments: list[tuple[Claim, Assessment | None, str]] = []

                for subclaim, decomp in subclaims:
                    assess = await self._repository.get_current_assessment(subclaim.id)
                    subclaim_assessments.append((subclaim, assess, decomp.relation.value))

                # Reassess
                if current:
                    reassess_result = await self._assessor.reassess(
                        claim=parent_claim,
                        previous_assessment=current,
                        trigger=trigger,
                        changes=[{"subclaim": str(claim_id), "type": trigger}],
                        subclaim_assessments=subclaim_assessments,
                    )
                    new_assessment = reassess_result.output
                else:
                    assess_result = await self._assessor.execute(AssessmentInput(
                        claim=parent_claim,
                        subclaim_assessments=subclaim_assessments,
                    ))
                    new_assessment = assess_result.output

                # Record change
                if current is None or current.status != new_assessment.status:
                    change = AssessmentChange(
                        claim_id=parent_claim.id,
                        previous_status=current.status if current else None,
                        new_status=new_assessment.status,
                        previous_confidence=current.confidence if current else None,
                        new_confidence=new_assessment.confidence,
                        trigger=trigger,
                        propagated_to=[],
                    )
                    result.changes.append(change)

                # Store new assessment
                await self._repository.add_assessment(new_assessment)
                result.claims_reassessed += 1

                # Recursively propagate to grandparents
                grandparent_result = await self.propagate_change(
                    parent_claim.id,
                    trigger=f"propagated_from_{claim_id}",
                )
                result.claims_reassessed += grandparent_result.claims_reassessed
                result.changes.extend(grandparent_result.changes)

            except Exception as e:
                logger.error(
                    "Propagation failed",
                    parent_claim_id=str(parent_claim.id),
                    error=str(e),
                )

        return result

    async def reassess_stale(
        self,
        older_than_days: int = 30,
        limit: int = 100,
    ) -> AssessmentStats:
        """Reassess claims with stale assessments.

        Args:
            older_than_days: Reassess assessments older than this
            limit: Maximum number of claims to reassess

        Returns:
            Statistics from the reassessment
        """
        from datetime import datetime, timedelta

        stats = AssessmentStats()
        cutoff = datetime.utcnow() - timedelta(days=older_than_days)

        # This would need a query to find stale assessments
        # For now, just log that this would happen
        logger.info(
            "Would reassess stale claims",
            older_than_days=older_than_days,
            cutoff=cutoff.isoformat(),
            limit=limit,
        )

        return stats

    async def get_assessment_summary(
        self,
        claim_id: UUID,
    ) -> dict[str, Any]:
        """Get a summary of a claim's assessment status.

        Args:
            claim_id: The claim ID

        Returns:
            Summary dict with assessment details
        """
        assessment = await self._repository.get_current_assessment(claim_id)
        tree = await self._repository.get_claim_tree(claim_id, max_depth=2)

        if assessment is None:
            return {
                "claim_id": str(claim_id),
                "status": "not_assessed",
                "has_tree": tree is not None,
            }

        return {
            "claim_id": str(claim_id),
            "status": assessment.status.value,
            "confidence": assessment.confidence,
            "assessed_at": assessment.assessed_at.isoformat(),
            "subclaim_summary": assessment.subclaim_summary,
            "evidence_for_count": len(assessment.evidence_for),
            "evidence_against_count": len(assessment.evidence_against),
            "tree_depth": tree.max_depth() if tree else 0,
            "is_current": assessment.is_current,
        }

    async def assess_batch(
        self,
        claim_ids: list[UUID],
        force_reassess: bool = False,
    ) -> list[AssessmentPipelineResult]:
        """Assess multiple claims.

        Args:
            claim_ids: List of claim IDs to assess
            force_reassess: Whether to reassess even if already assessed

        Returns:
            List of results for each claim
        """
        results = []
        for claim_id in claim_ids:
            result = await self.assess_claim(claim_id, force_reassess)
            results.append(result)
        return results
