"""Contributions API router.

Provides endpoints for:
- Submitting new contributions
- Listing contributions
- Retrieving contribution details
- Managing contribution queue
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from episteme.domain.enums import ContributionType, ReviewDecision
from episteme.domain.contribution import Contribution
from episteme.domain.contributor import Contributor
from episteme.api.dependencies import (
    ClaimRepositoryDep,
    ContributionPipelineDep,
    RequiredApiKeyDep,
)

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================


class ContributionCreate(BaseModel):
    """Request model for creating a contribution."""

    claim_id: UUID = Field(
        ...,
        description="ID of the claim this contribution relates to",
    )
    contribution_type: ContributionType = Field(
        ...,
        description="Type of contribution",
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="The contribution content (argument, evidence, proposed edit)",
    )
    evidence_urls: list[str] = Field(
        default_factory=list,
        description="URLs supporting this contribution",
    )
    merge_target_claim_id: UUID | None = Field(
        default=None,
        description="For PROPOSE_MERGE: the claim to merge into",
    )
    proposed_canonical_form: str | None = Field(
        default=None,
        max_length=2000,
        description="For PROPOSE_EDIT: the proposed new canonical form",
    )


class ContributionResponse(BaseModel):
    """Response model for a contribution."""

    id: UUID
    claim_id: UUID
    contributor_id: str
    contribution_type: ContributionType
    content: str
    evidence_urls: list[str]
    submitted_at: datetime
    review_status: str
    merge_target_claim_id: UUID | None = None
    proposed_canonical_form: str | None = None


class ReviewResponse(BaseModel):
    """Response model for a review decision."""

    contribution_id: UUID
    decision: str
    reasoning: str
    confidence: float
    policy_citations: list[str]
    reviewed_at: datetime
    feedback: str


class ContributionDetailResponse(BaseModel):
    """Response model for contribution with review."""

    contribution: ContributionResponse
    review: ReviewResponse | None = None


class ContributionListResponse(BaseModel):
    """Response model for listing contributions."""

    contributions: list[ContributionResponse]
    total: int
    offset: int
    limit: int


class SubmitResultResponse(BaseModel):
    """Response model for contribution submission."""

    contribution_id: UUID
    decision: str
    reasoning: str
    confidence: float
    feedback: str
    escalated: bool
    processing_time_ms: float


# ============================================================================
# Endpoints
# ============================================================================


@router.post(
    "",
    response_model=SubmitResultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a contribution",
)
async def submit_contribution(
    contribution_data: ContributionCreate,
    repository: ClaimRepositoryDep,
    pipeline: ContributionPipelineDep,
    api_key: RequiredApiKeyDep,
) -> SubmitResultResponse:
    """Submit a new contribution for review.

    This endpoint:
    1. Validates the contribution format
    2. Checks contributor rate limits
    3. Routes to the Contribution Reviewer
    4. Returns the review decision (accept/reject/escalate)

    For accepted contributions, changes are automatically applied
    to the claim by the Claim Steward.
    """
    # Get the target claim
    claim = await repository.get_claim(contribution_data.claim_id)
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {contribution_data.claim_id} not found",
        )

    # Create contribution object
    contribution = Contribution(
        claim_id=contribution_data.claim_id,
        contributor_id=api_key,  # Use API key as contributor ID for now
        contribution_type=contribution_data.contribution_type,
        content=contribution_data.content,
        evidence_urls=contribution_data.evidence_urls,
        merge_target_claim_id=contribution_data.merge_target_claim_id,
        proposed_canonical_form=contribution_data.proposed_canonical_form,
    )

    # Get or create contributor record
    contributor = Contributor(
        id=api_key,
        display_name=api_key[:8],  # Abbreviated for display
    )

    # Get merge target if applicable
    merge_target = None
    if contribution_data.merge_target_claim_id:
        merge_target = await repository.get_claim(contribution_data.merge_target_claim_id)
        if merge_target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Merge target claim {contribution_data.merge_target_claim_id} not found",
            )

    # Process through pipeline
    result = await pipeline.process_contribution(
        contribution=contribution,
        claim=claim,
        contributor=contributor,
        merge_target_claim=merge_target,
    )

    if result.decision is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing contribution: " + "; ".join(result.stats.errors),
        )

    return SubmitResultResponse(
        contribution_id=result.contribution_id,
        decision=result.decision.value,
        reasoning=result.review.reasoning if result.review else "",
        confidence=result.review.confidence if result.review else 0.0,
        feedback=result.review.actions_if_accepted[0] if result.review and result.review.actions_if_accepted else "",
        escalated=result.escalated_to_arbitration,
        processing_time_ms=result.processing_time_ms,
    )


@router.get(
    "",
    response_model=ContributionListResponse,
    summary="List contributions",
)
async def list_contributions(
    repository: ClaimRepositoryDep,
    claim_id: UUID | None = Query(default=None, description="Filter by claim"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by review status"),
    contribution_type: ContributionType | None = Query(default=None, description="Filter by type"),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum results"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> ContributionListResponse:
    """List contributions with optional filtering.

    Supports filtering by:
    - claim_id: Contributions for a specific claim
    - status: pending, accepted, rejected, escalated
    - contribution_type: Type of contribution
    """
    # In a real implementation, this would query the database
    # For now, return empty list
    return ContributionListResponse(
        contributions=[],
        total=0,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/{contribution_id}",
    response_model=ContributionDetailResponse,
    summary="Get contribution details",
)
async def get_contribution(
    contribution_id: UUID,
    repository: ClaimRepositoryDep,
) -> ContributionDetailResponse:
    """Get a contribution with its review decision."""
    # In a real implementation, this would query the database
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Contribution {contribution_id} not found",
    )


@router.get(
    "/claim/{claim_id}",
    response_model=list[ContributionResponse],
    summary="Get contributions for a claim",
)
async def get_claim_contributions(
    claim_id: UUID,
    repository: ClaimRepositoryDep,
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
) -> list[ContributionResponse]:
    """Get all contributions for a specific claim."""
    # Verify claim exists
    claim = await repository.get_claim(claim_id)
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    # In a real implementation, this would query the database
    return []


@router.get(
    "/queue/stats",
    response_model=dict[str, Any],
    summary="Get contribution queue statistics",
)
async def get_queue_stats(
    pipeline: ContributionPipelineDep,
) -> dict[str, Any]:
    """Get statistics about the contribution queue.

    Returns counts of pending, accepted, rejected, and escalated
    contributions, as well as processing metrics.
    """
    return await pipeline.get_queue_statistics()


@router.post(
    "/batch",
    response_model=list[SubmitResultResponse],
    summary="Submit multiple contributions",
)
async def submit_batch(
    contributions: list[ContributionCreate],
    repository: ClaimRepositoryDep,
    pipeline: ContributionPipelineDep,
    api_key: RequiredApiKeyDep,
) -> list[SubmitResultResponse]:
    """Submit multiple contributions in a batch.

    Each contribution is processed independently. If one fails,
    others will still be processed.
    """
    if len(contributions) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 contributions per batch",
        )

    results = []
    for contrib_data in contributions:
        try:
            # Reuse the single submission logic
            result = await submit_contribution(
                contribution_data=contrib_data,
                repository=repository,
                pipeline=pipeline,
                api_key=api_key,
            )
            results.append(result)
        except HTTPException as e:
            # Record the error but continue with other contributions
            results.append(SubmitResultResponse(
                contribution_id=UUID("00000000-0000-0000-0000-000000000000"),
                decision="error",
                reasoning=e.detail,
                confidence=0.0,
                feedback="",
                escalated=False,
                processing_time_ms=0.0,
            ))

    return results
