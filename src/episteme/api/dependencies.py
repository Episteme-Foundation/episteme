"""FastAPI dependencies for the Episteme API.

Provides dependency injection for:
- Database connections
- Repository instances
- Pipeline instances
- Authentication
"""

from functools import lru_cache
from typing import Annotated, AsyncGenerator

from fastapi import Depends, Header, HTTPException, status

from episteme.config import get_settings, Settings
from episteme.storage.graph.client import Neo4jClient
from episteme.storage.vector.client import VectorClient
from episteme.storage.document.client import DocumentClient
from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.pipelines.extraction import ExtractionPipeline
from episteme.pipelines.decomposition import DecompositionPipeline
from episteme.pipelines.assessment import AssessmentPipeline
from episteme.pipelines.contribution import ContributionPipeline
from episteme.pipelines.arbitration import ArbitrationPipeline


# Global clients (lazily initialized)
_neo4j_client: Neo4jClient | None = None
_vector_client: VectorClient | None = None
_document_client: DocumentClient | None = None


async def get_neo4j_client() -> Neo4jClient:
    """Get the Neo4j client, initializing if needed."""
    global _neo4j_client
    if _neo4j_client is None:
        _neo4j_client = Neo4jClient()
        await _neo4j_client.connect()
    return _neo4j_client


async def get_vector_client() -> VectorClient:
    """Get the vector client, initializing if needed."""
    global _vector_client
    if _vector_client is None:
        _vector_client = VectorClient()
        await _vector_client.initialize()
    return _vector_client


async def get_document_client() -> DocumentClient:
    """Get the document client, initializing if needed."""
    global _document_client
    if _document_client is None:
        _document_client = DocumentClient()
        await _document_client.initialize_schema()
    return _document_client


async def get_claim_repository(
    neo4j: Annotated[Neo4jClient, Depends(get_neo4j_client)],
    vector: Annotated[VectorClient, Depends(get_vector_client)],
    document: Annotated[DocumentClient, Depends(get_document_client)],
) -> ClaimRepository:
    """Get the claim repository with all backends."""
    return ClaimRepository(neo4j, vector, document)


async def get_extraction_pipeline(
    repository: Annotated[ClaimRepository, Depends(get_claim_repository)],
    vector: Annotated[VectorClient, Depends(get_vector_client)],
) -> ExtractionPipeline:
    """Get the extraction pipeline."""
    return ExtractionPipeline(repository=repository, vector_client=vector)


async def get_decomposition_pipeline(
    repository: Annotated[ClaimRepository, Depends(get_claim_repository)],
    vector: Annotated[VectorClient, Depends(get_vector_client)],
) -> DecompositionPipeline:
    """Get the decomposition pipeline."""
    return DecompositionPipeline(repository=repository, vector_client=vector)


async def get_assessment_pipeline(
    repository: Annotated[ClaimRepository, Depends(get_claim_repository)],
) -> AssessmentPipeline:
    """Get the assessment pipeline."""
    return AssessmentPipeline(repository=repository)


async def get_contribution_pipeline(
    repository: Annotated[ClaimRepository, Depends(get_claim_repository)],
) -> ContributionPipeline:
    """Get the contribution pipeline."""
    return ContributionPipeline(repository=repository)


async def get_arbitration_pipeline(
    repository: Annotated[ClaimRepository, Depends(get_claim_repository)],
) -> ArbitrationPipeline:
    """Get the arbitration pipeline."""
    return ArbitrationPipeline(repository=repository)


def get_settings_dep() -> Settings:
    """Get application settings."""
    return get_settings()


async def verify_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
) -> str | None:
    """Verify API key for authenticated endpoints.

    For now, this is a simple check. In production, this would
    validate against a database of API keys.
    """
    # For development, allow unauthenticated requests
    settings = get_settings()
    if settings.is_development:
        return x_api_key

    if x_api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
        )

    # TODO: Validate API key against database
    return x_api_key


async def require_api_key(
    api_key: Annotated[str | None, Depends(verify_api_key)],
) -> str:
    """Require a valid API key (for write operations)."""
    settings = get_settings()
    if settings.is_development:
        return api_key or "dev-key"

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required for this operation",
        )
    return api_key


# Type aliases for cleaner dependency injection
ClaimRepositoryDep = Annotated[ClaimRepository, Depends(get_claim_repository)]
ExtractionPipelineDep = Annotated[ExtractionPipeline, Depends(get_extraction_pipeline)]
DecompositionPipelineDep = Annotated[DecompositionPipeline, Depends(get_decomposition_pipeline)]
AssessmentPipelineDep = Annotated[AssessmentPipeline, Depends(get_assessment_pipeline)]
ContributionPipelineDep = Annotated[ContributionPipeline, Depends(get_contribution_pipeline)]
ArbitrationPipelineDep = Annotated[ArbitrationPipeline, Depends(get_arbitration_pipeline)]
VectorClientDep = Annotated[VectorClient, Depends(get_vector_client)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
ApiKeyDep = Annotated[str | None, Depends(verify_api_key)]
RequiredApiKeyDep = Annotated[str, Depends(require_api_key)]
