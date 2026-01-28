"""Claims API router.

Provides endpoints for:
- CRUD operations on claims
- Decomposition tree retrieval
- Assessment retrieval and triggering
- Claim validation for browser extensions
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from episteme.domain.claim import Claim, ClaimTree
from episteme.domain.assessment import Assessment
from episteme.domain.enums import ClaimState, ClaimType, AssessmentStatus
from episteme.api.dependencies import (
    ClaimRepositoryDep,
    DecompositionPipelineDep,
    AssessmentPipelineDep,
    VectorClientDep,
    RequiredApiKeyDep,
)

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================


class ClaimCreate(BaseModel):
    """Request model for creating a claim."""

    canonical_form: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The precise, unambiguous statement of the claim",
    )
    claim_type: ClaimType = Field(
        default=ClaimType.EMPIRICAL_DERIVED,
        description="Classification of the claim",
    )


class ClaimUpdate(BaseModel):
    """Request model for updating a claim."""

    canonical_form: str | None = Field(
        default=None,
        min_length=1,
        max_length=2000,
        description="Updated canonical form",
    )
    state: ClaimState | None = Field(
        default=None,
        description="Updated state",
    )


class ClaimResponse(BaseModel):
    """Response model for a claim."""

    id: UUID
    canonical_form: str
    claim_type: ClaimType
    state: ClaimState
    created_at: datetime
    updated_at: datetime
    alternative_forms: list[str]

    @classmethod
    def from_claim(cls, claim: Claim) -> "ClaimResponse":
        return cls(
            id=claim.id,
            canonical_form=claim.canonical_form,
            claim_type=claim.claim_type,
            state=claim.state,
            created_at=claim.created_at,
            updated_at=claim.updated_at,
            alternative_forms=claim.alternative_forms,
        )


class ClaimListResponse(BaseModel):
    """Response model for listing claims."""

    claims: list[ClaimResponse]
    total: int
    offset: int
    limit: int


class AssessmentResponse(BaseModel):
    """Response model for an assessment."""

    id: UUID
    claim_id: UUID
    status: AssessmentStatus
    confidence: float
    reasoning_trace: str
    assessed_at: datetime
    subclaim_summary: dict[str, int]

    @classmethod
    def from_assessment(cls, assessment: Assessment) -> "AssessmentResponse":
        return cls(
            id=assessment.id,
            claim_id=assessment.claim_id,
            status=assessment.status,
            confidence=assessment.confidence,
            reasoning_trace=assessment.reasoning_trace,
            assessed_at=assessment.assessed_at,
            subclaim_summary=assessment.subclaim_summary,
        )


class TreeNodeResponse(BaseModel):
    """Response model for a node in the decomposition tree."""

    claim: ClaimResponse
    relation: str | None = None
    reasoning: str | None = None
    children: list["TreeNodeResponse"] = Field(default_factory=list)
    is_leaf: bool = True


class ClaimTreeResponse(BaseModel):
    """Response model for a claim with its decomposition tree."""

    root: TreeNodeResponse
    total_claims: int
    max_depth: int


class ValidationRequest(BaseModel):
    """Request model for validating text."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Text to validate for claims",
    )
    context: str | None = Field(
        default=None,
        max_length=5000,
        description="Optional context for better matching",
    )


class ValidationResult(BaseModel):
    """Result for a single claim validation."""

    claim_id: UUID
    canonical_form: str
    similarity_score: float
    status: AssessmentStatus | None
    confidence: float | None


class ValidationResponse(BaseModel):
    """Response model for text validation."""

    matches: list[ValidationResult]
    processing_time_ms: float


# ============================================================================
# Endpoints
# ============================================================================


@router.post(
    "",
    response_model=ClaimResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new claim",
)
async def create_claim(
    claim_data: ClaimCreate,
    repository: ClaimRepositoryDep,
    api_key: RequiredApiKeyDep,
) -> ClaimResponse:
    """Create a new claim in the knowledge graph.

    The claim will be created in the CREATED state. Use the decomposition
    endpoint to build its subclaim tree, then the assessment endpoint to
    evaluate its validity.
    """
    claim = Claim(
        canonical_form=claim_data.canonical_form,
        claim_type=claim_data.claim_type,
        state=ClaimState.CREATED,
        created_by="api",
    )
    await repository.create_claim(claim)
    return ClaimResponse.from_claim(claim)


@router.get(
    "",
    response_model=ClaimListResponse,
    summary="List claims",
)
async def list_claims(
    repository: ClaimRepositoryDep,
    state: ClaimState | None = Query(default=None, description="Filter by state"),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum results"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> ClaimListResponse:
    """List claims with optional filtering and pagination."""
    claims = await repository.list_claims(state=state, limit=limit, offset=offset)
    total = await repository.count_claims(state=state)

    return ClaimListResponse(
        claims=[ClaimResponse.from_claim(c) for c in claims],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/{claim_id}",
    response_model=ClaimResponse,
    summary="Get a claim by ID",
)
async def get_claim(
    claim_id: UUID,
    repository: ClaimRepositoryDep,
) -> ClaimResponse:
    """Get a single claim by its ID."""
    claim = await repository.get_claim(claim_id)
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )
    return ClaimResponse.from_claim(claim)


@router.patch(
    "/{claim_id}",
    response_model=ClaimResponse,
    summary="Update a claim",
)
async def update_claim(
    claim_id: UUID,
    claim_data: ClaimUpdate,
    repository: ClaimRepositoryDep,
    api_key: RequiredApiKeyDep,
) -> ClaimResponse:
    """Update a claim's canonical form or state."""
    claim = await repository.get_claim(claim_id)
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    if claim_data.canonical_form is not None:
        claim.canonical_form = claim_data.canonical_form
    if claim_data.state is not None:
        claim.state = claim_data.state
    claim.updated_at = datetime.utcnow()

    await repository.update_claim(claim)
    return ClaimResponse.from_claim(claim)


@router.delete(
    "/{claim_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a claim",
)
async def delete_claim(
    claim_id: UUID,
    repository: ClaimRepositoryDep,
    api_key: RequiredApiKeyDep,
) -> None:
    """Delete a claim from the knowledge graph.

    Note: Consider using deprecation instead of deletion to preserve history.
    """
    deleted = await repository.delete_claim(claim_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )


@router.get(
    "/{claim_id}/tree",
    response_model=ClaimTreeResponse,
    summary="Get claim decomposition tree",
)
async def get_claim_tree(
    claim_id: UUID,
    repository: ClaimRepositoryDep,
    max_depth: int = Query(default=5, ge=1, le=10, description="Maximum tree depth"),
) -> ClaimTreeResponse:
    """Get a claim with its full decomposition tree."""
    tree = await repository.get_claim_tree(claim_id, max_depth=max_depth)
    if tree is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    def tree_to_response(t: ClaimTree, relation: str | None = None, reasoning: str | None = None) -> TreeNodeResponse:
        children = []
        for child_tree, decomp in t.children:
            children.append(tree_to_response(
                child_tree,
                relation=decomp.relation.value,
                reasoning=decomp.reasoning,
            ))
        return TreeNodeResponse(
            claim=ClaimResponse.from_claim(t.claim),
            relation=relation,
            reasoning=reasoning,
            children=children,
            is_leaf=t.is_leaf,
        )

    return ClaimTreeResponse(
        root=tree_to_response(tree),
        total_claims=len(tree.get_all_claims()),
        max_depth=tree.max_depth(),
    )


@router.post(
    "/{claim_id}/decompose",
    response_model=dict[str, Any],
    summary="Decompose a claim",
)
async def decompose_claim(
    claim_id: UUID,
    pipeline: DecompositionPipelineDep,
    api_key: RequiredApiKeyDep,
    context: str | None = Query(default=None, description="Optional context"),
) -> dict[str, Any]:
    """Trigger decomposition of a claim into subclaims.

    This will recursively identify what the claim depends on and build
    the decomposition tree in the graph.
    """
    result = await pipeline.decompose_claim(claim_id, context=context)

    if result.stats.errors:
        if "Claim not found" in result.stats.errors[0]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Claim {claim_id} not found",
            )

    return {
        "claim_id": str(claim_id),
        "tree_depth": result.tree_depth,
        "claims_processed": result.stats.claims_processed,
        "subclaims_found": result.stats.subclaims_found,
        "subclaims_created": result.stats.subclaims_created,
        "processing_time_ms": result.processing_time_ms,
        "errors": result.stats.errors,
    }


@router.get(
    "/{claim_id}/assessment",
    response_model=AssessmentResponse | None,
    summary="Get current assessment",
)
async def get_claim_assessment(
    claim_id: UUID,
    repository: ClaimRepositoryDep,
) -> AssessmentResponse | None:
    """Get the current assessment for a claim."""
    claim = await repository.get_claim(claim_id)
    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    assessment = await repository.get_current_assessment(claim_id)
    if assessment is None:
        return None
    return AssessmentResponse.from_assessment(assessment)


@router.post(
    "/{claim_id}/assess",
    response_model=dict[str, Any],
    summary="Assess a claim",
)
async def assess_claim(
    claim_id: UUID,
    pipeline: AssessmentPipelineDep,
    api_key: RequiredApiKeyDep,
    force: bool = Query(default=False, description="Force reassessment"),
) -> dict[str, Any]:
    """Trigger assessment of a claim based on its decomposition tree.

    This will evaluate the claim bottom-up, aggregating subclaim assessments
    to determine the parent's validity status.
    """
    result = await pipeline.assess_claim(claim_id, force_reassess=force)

    if result.stats.errors:
        if "Claim not found" in result.stats.errors[0]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Claim {claim_id} not found",
            )

    return {
        "claim_id": str(claim_id),
        "status": result.root_assessment.status.value if result.root_assessment else None,
        "confidence": result.root_assessment.confidence if result.root_assessment else None,
        "claims_assessed": result.stats.claims_assessed,
        "verified_count": result.stats.verified_count,
        "contested_count": result.stats.contested_count,
        "processing_time_ms": result.processing_time_ms,
        "errors": result.stats.errors,
    }


@router.post(
    "/validate",
    response_model=ValidationResponse,
    summary="Validate text for claims",
)
async def validate_text(
    request: ValidationRequest,
    repository: ClaimRepositoryDep,
    vector_client: VectorClientDep,
) -> ValidationResponse:
    """Validate text by finding matching claims in the knowledge graph.

    This is the primary endpoint for browser extensions. It takes arbitrary
    text and returns matching claims with their assessment status.
    """
    import time
    start = time.time()

    # Search for similar claims
    similar = await vector_client.search_similar(
        request.text,
        limit=10,
    )

    matches = []
    for result in similar:
        # Get assessment for each match
        assessment = await repository.get_current_assessment(result.claim_id)

        matches.append(ValidationResult(
            claim_id=result.claim_id,
            canonical_form=result.canonical_form or "",
            similarity_score=result.score,
            status=assessment.status if assessment else None,
            confidence=assessment.confidence if assessment else None,
        ))

    processing_time = (time.time() - start) * 1000

    return ValidationResponse(
        matches=matches,
        processing_time_ms=processing_time,
    )


# Enable forward references for recursive model
TreeNodeResponse.model_rebuild()
