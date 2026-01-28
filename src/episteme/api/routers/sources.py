"""Sources API router.

Provides endpoints for:
- Ingesting new source documents
- Retrieving source information
- Triggering claim extraction from sources
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl

from episteme.domain.enums import SourceType
from episteme.api.dependencies import (
    ClaimRepositoryDep,
    ExtractionPipelineDep,
    RequiredApiKeyDep,
)

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================


class SourceCreate(BaseModel):
    """Request model for ingesting a new source."""

    content: str = Field(
        ...,
        min_length=1,
        max_length=1000000,
        description="The document text content",
    )
    url: str | None = Field(
        default=None,
        max_length=2000,
        description="URL of the source (if available)",
    )
    source_type: SourceType = Field(
        default=SourceType.UNKNOWN,
        description="Classification of the source",
    )
    title: str | None = Field(
        default=None,
        max_length=1000,
        description="Title of the source",
    )
    author: str | None = Field(
        default=None,
        max_length=500,
        description="Author of the source",
    )
    published_at: datetime | None = Field(
        default=None,
        description="Publication date",
    )
    additional_context: str | None = Field(
        default=None,
        max_length=5000,
        description="Additional context for extraction",
    )


class SourceResponse(BaseModel):
    """Response model for a source."""

    id: UUID
    url: str | None
    source_type: str
    title: str
    author: str | None
    published_at: datetime | None
    retrieved_at: datetime


class ExtractionResultResponse(BaseModel):
    """Response model for extraction results."""

    source_id: UUID
    claims_extracted: int
    claims_matched: int
    claims_created: int
    instances_created: int
    processing_time_ms: float
    errors: list[str]


class InstanceResponse(BaseModel):
    """Response model for a claim instance."""

    id: UUID
    claim_id: UUID
    original_text: str
    context: str | None
    location: str | None
    confidence: float


class SourceDetailResponse(BaseModel):
    """Response model for source with instances."""

    source: SourceResponse
    instances: list[InstanceResponse]


# ============================================================================
# Endpoints
# ============================================================================


@router.post(
    "",
    response_model=ExtractionResultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a new source",
)
async def ingest_source(
    source_data: SourceCreate,
    pipeline: ExtractionPipelineDep,
    api_key: RequiredApiKeyDep,
) -> ExtractionResultResponse:
    """Ingest a new source document and extract claims.

    This endpoint:
    1. Stores the source document
    2. Extracts claims using the ExtractorAgent
    3. Matches claims to existing canonical forms
    4. Creates new claims for unmatched extractions
    5. Links claims to the source via instances

    Returns extraction statistics and any errors encountered.
    """
    result = await pipeline.process_document(
        content=source_data.content,
        source_url=source_data.url,
        source_type=source_data.source_type,
        source_title=source_data.title,
        source_author=source_data.author,
        published_at=source_data.published_at,
        additional_context=source_data.additional_context,
    )

    return ExtractionResultResponse(
        source_id=result.source_id,
        claims_extracted=result.claims_extracted,
        claims_matched=result.claims_matched,
        claims_created=result.claims_created,
        instances_created=result.instances_created,
        processing_time_ms=result.processing_time_ms,
        errors=result.errors,
    )


@router.get(
    "/{source_id}",
    response_model=SourceDetailResponse,
    summary="Get a source with its instances",
)
async def get_source(
    source_id: UUID,
    repository: ClaimRepositoryDep,
) -> SourceDetailResponse:
    """Get a source document with all claim instances extracted from it."""
    # Access the document client through the repository's internal reference
    source = await repository._document.get_source(source_id)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source {source_id} not found",
        )

    instances = await repository._document.get_instances_for_source(source_id)

    return SourceDetailResponse(
        source=SourceResponse(
            id=source.id,
            url=source.url,
            source_type=source.source_type,
            title=source.title,
            author=source.author,
            published_at=source.published_at,
            retrieved_at=source.retrieved_at,
        ),
        instances=[
            InstanceResponse(
                id=inst.id,
                claim_id=inst.claim_id,
                original_text=inst.original_text,
                context=inst.context,
                location=inst.location,
                confidence=inst.confidence,
            )
            for inst in instances
        ],
    )


@router.post(
    "/{source_id}/reprocess",
    response_model=ExtractionResultResponse,
    summary="Reprocess a source",
)
async def reprocess_source(
    source_id: UUID,
    pipeline: ExtractionPipelineDep,
    api_key: RequiredApiKeyDep,
) -> ExtractionResultResponse:
    """Reprocess an existing source to re-extract claims.

    Useful for re-running extraction with updated models or prompts.
    """
    result = await pipeline.reprocess_source(source_id)

    if result.errors and "Source not found" in result.errors[0]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source {source_id} not found",
        )

    return ExtractionResultResponse(
        source_id=result.source_id,
        claims_extracted=result.claims_extracted,
        claims_matched=result.claims_matched,
        claims_created=result.claims_created,
        instances_created=result.instances_created,
        processing_time_ms=result.processing_time_ms,
        errors=result.errors,
    )


@router.get(
    "",
    response_model=list[SourceResponse],
    summary="List sources",
)
async def list_sources(
    repository: ClaimRepositoryDep,
    source_type: SourceType | None = Query(default=None, description="Filter by type"),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum results"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> list[SourceResponse]:
    """List source documents with optional filtering."""
    sources = await repository._document.list_sources(
        source_type=source_type.value if source_type else None,
        limit=limit,
        offset=offset,
    )

    return [
        SourceResponse(
            id=s.id,
            url=s.url,
            source_type=s.source_type,
            title=s.title,
            author=s.author,
            published_at=s.published_at,
            retrieved_at=s.retrieved_at,
        )
        for s in sources
    ]
