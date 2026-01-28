"""Search API router.

Provides endpoints for:
- Semantic search across claims
- Full-text search (future)
- Faceted filtering
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from episteme.domain.enums import ClaimType, ClaimState, AssessmentStatus
from episteme.api.dependencies import (
    ClaimRepositoryDep,
    VectorClientDep,
)

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================


class SearchResult(BaseModel):
    """A single search result."""

    claim_id: UUID
    canonical_form: str
    claim_type: ClaimType | None
    state: ClaimState | None
    similarity_score: float
    assessment_status: AssessmentStatus | None = None
    assessment_confidence: float | None = None


class SearchResponse(BaseModel):
    """Response model for search results."""

    query: str
    results: list[SearchResult]
    total: int
    processing_time_ms: float


class FacetCount(BaseModel):
    """Count for a facet value."""

    value: str
    count: int


class FacetsResponse(BaseModel):
    """Available facets for filtering."""

    claim_types: list[FacetCount]
    states: list[FacetCount]
    assessment_statuses: list[FacetCount]


# ============================================================================
# Endpoints
# ============================================================================


@router.get(
    "",
    response_model=SearchResponse,
    summary="Semantic search for claims",
)
async def search_claims(
    repository: ClaimRepositoryDep,
    vector_client: VectorClientDep,
    q: str = Query(
        ...,
        min_length=1,
        max_length=1000,
        description="Search query",
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Maximum results",
    ),
    claim_type: ClaimType | None = Query(
        default=None,
        description="Filter by claim type",
    ),
    state: ClaimState | None = Query(
        default=None,
        description="Filter by claim state",
    ),
    min_similarity: float = Query(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Minimum similarity score",
    ),
    include_assessment: bool = Query(
        default=True,
        description="Include assessment status in results",
    ),
) -> SearchResponse:
    """Search for claims using semantic similarity.

    Uses vector embeddings to find claims similar to the query text.
    Results are ranked by similarity score.

    Filters can be applied to narrow down results by claim type or state.
    """
    import time
    start = time.time()

    # Build metadata filter
    filter_metadata = {}
    if claim_type:
        filter_metadata["claim_type"] = claim_type.value
    if state:
        filter_metadata["state"] = state.value

    # Search
    similar = await vector_client.search_similar(
        q,
        limit=limit,
        filter_metadata=filter_metadata if filter_metadata else None,
    )

    # Filter by minimum similarity
    similar = [s for s in similar if s.score >= min_similarity]

    # Build results with optional assessment lookup
    results = []
    for result in similar:
        assessment_status = None
        assessment_confidence = None

        if include_assessment:
            assessment = await repository.get_current_assessment(result.claim_id)
            if assessment:
                assessment_status = assessment.status
                assessment_confidence = assessment.confidence

        # Parse metadata
        claim_type_val = None
        state_val = None
        if result.metadata:
            if "claim_type" in result.metadata:
                try:
                    claim_type_val = ClaimType(result.metadata["claim_type"])
                except ValueError:
                    pass
            if "state" in result.metadata:
                try:
                    state_val = ClaimState(result.metadata["state"])
                except ValueError:
                    pass

        results.append(SearchResult(
            claim_id=result.claim_id,
            canonical_form=result.canonical_form or "",
            claim_type=claim_type_val,
            state=state_val,
            similarity_score=result.score,
            assessment_status=assessment_status,
            assessment_confidence=assessment_confidence,
        ))

    processing_time = (time.time() - start) * 1000

    return SearchResponse(
        query=q,
        results=results,
        total=len(results),
        processing_time_ms=processing_time,
    )


@router.get(
    "/similar/{claim_id}",
    response_model=SearchResponse,
    summary="Find claims similar to a given claim",
)
async def find_similar_claims(
    claim_id: UUID,
    repository: ClaimRepositoryDep,
    vector_client: VectorClientDep,
    limit: int = Query(
        default=10,
        ge=1,
        le=50,
        description="Maximum results",
    ),
    exclude_self: bool = Query(
        default=True,
        description="Exclude the source claim from results",
    ),
) -> SearchResponse:
    """Find claims similar to a given claim.

    Useful for:
    - Identifying potential duplicates
    - Finding related claims for decomposition
    - Discovering claim clusters
    """
    import time
    start = time.time()

    # Get the source claim
    claim = await repository.get_claim(claim_id)
    if claim is None:
        return SearchResponse(
            query=str(claim_id),
            results=[],
            total=0,
            processing_time_ms=0,
        )

    # Search using the claim's canonical form
    similar = await vector_client.search_similar(
        claim.canonical_form,
        limit=limit + 1 if exclude_self else limit,
    )

    # Build results
    results = []
    for result in similar:
        if exclude_self and result.claim_id == claim_id:
            continue

        assessment = await repository.get_current_assessment(result.claim_id)

        claim_type_val = None
        state_val = None
        if result.metadata:
            if "claim_type" in result.metadata:
                try:
                    claim_type_val = ClaimType(result.metadata["claim_type"])
                except ValueError:
                    pass
            if "state" in result.metadata:
                try:
                    state_val = ClaimState(result.metadata["state"])
                except ValueError:
                    pass

        results.append(SearchResult(
            claim_id=result.claim_id,
            canonical_form=result.canonical_form or "",
            claim_type=claim_type_val,
            state=state_val,
            similarity_score=result.score,
            assessment_status=assessment.status if assessment else None,
            assessment_confidence=assessment.confidence if assessment else None,
        ))

    # Limit to requested count
    results = results[:limit]

    processing_time = (time.time() - start) * 1000

    return SearchResponse(
        query=claim.canonical_form,
        results=results,
        total=len(results),
        processing_time_ms=processing_time,
    )


@router.get(
    "/facets",
    response_model=FacetsResponse,
    summary="Get available search facets",
)
async def get_facets(
    repository: ClaimRepositoryDep,
) -> FacetsResponse:
    """Get counts for available search facets.

    Returns counts of claims by type, state, and assessment status
    for building filter UIs.
    """
    # Get counts by state
    states = []
    for state in ClaimState:
        count = await repository.count_claims(state=state)
        if count > 0:
            states.append(FacetCount(value=state.value, count=count))

    # For claim types and assessment statuses, we'd need additional
    # queries or denormalized data. For now, return empty lists.
    # These would be populated in a production implementation.

    return FacetsResponse(
        claim_types=[FacetCount(value=ct.value, count=0) for ct in ClaimType],
        states=states,
        assessment_statuses=[FacetCount(value=s.value, count=0) for s in AssessmentStatus],
    )


@router.get(
    "/stats",
    response_model=dict[str, Any],
    summary="Get search statistics",
)
async def get_search_stats(
    repository: ClaimRepositoryDep,
) -> dict[str, Any]:
    """Get statistics about the knowledge graph."""
    stats = await repository.get_statistics()
    return stats
