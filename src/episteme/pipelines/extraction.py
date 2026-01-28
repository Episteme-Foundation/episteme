"""Extraction pipeline for processing documents into claims.

The extraction pipeline orchestrates:
1. Document ingestion and storage
2. Claim extraction via ExtractorAgent
3. Claim matching via MatcherAgent
4. Storage of new claims and instances

This is the entry point for processing new content into the knowledge graph.
"""

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import structlog

from episteme.domain.claim import Claim
from episteme.domain.instance import Instance, Source, ExtractedClaim
from episteme.domain.enums import ClaimType, SourceType, ClaimState
from episteme.llm.agents.extractor import ExtractorAgent, ExtractionInput
from episteme.llm.agents.matcher import MatcherAgent, MatchingInput
from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.storage.vector.client import VectorClient
from episteme.storage.document.models import SourceModel
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class ExtractionResult:
    """Result from processing a source through the extraction pipeline."""

    source_id: UUID
    claims_extracted: int
    claims_matched: int
    claims_created: int
    instances_created: int
    errors: list[str] = field(default_factory=list)
    processing_time_ms: float = 0.0
    details: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class PipelineConfig:
    """Configuration for the extraction pipeline."""

    min_extraction_confidence: float = 0.7
    matching_top_k: int = 20
    matching_threshold: float = 0.85
    skip_low_confidence: bool = False
    log_all_claims: bool = True


class ExtractionPipeline:
    """Pipeline for extracting claims from documents.

    Orchestrates the full flow from document to stored claims:

    1. **Ingest**: Store the source document
    2. **Extract**: Use ExtractorAgent to identify claims
    3. **Match**: Use MatcherAgent + vector search to match/create claims
    4. **Store**: Persist new claims and instances

    Example:
        ```python
        pipeline = ExtractionPipeline(
            repository=claim_repo,
            vector_client=vector_client,
        )

        result = await pipeline.process_document(
            content="The Earth is approximately 4.5 billion years old...",
            source_url="https://example.com/article",
            source_type=SourceType.NEWS_SECONDARY,
        )

        print(f"Extracted {result.claims_extracted} claims")
        print(f"Created {result.claims_created} new claims")
        print(f"Matched {result.claims_matched} existing claims")
        ```
    """

    def __init__(
        self,
        repository: ClaimRepository,
        vector_client: VectorClient,
        extractor: ExtractorAgent | None = None,
        matcher: MatcherAgent | None = None,
        config: PipelineConfig | None = None,
    ) -> None:
        """Initialize the extraction pipeline.

        Args:
            repository: Claim repository for storage operations
            vector_client: Vector client for similarity search
            extractor: Extractor agent (creates one if not provided)
            matcher: Matcher agent (creates one if not provided)
            config: Pipeline configuration
        """
        self._repository = repository
        self._vector = vector_client
        self._extractor = extractor or ExtractorAgent()
        self._matcher = matcher or MatcherAgent()
        self._config = config or PipelineConfig()
        self._settings = get_settings()

    async def process_document(
        self,
        content: str,
        source_url: str | None = None,
        source_type: SourceType = SourceType.UNKNOWN,
        source_title: str | None = None,
        source_author: str | None = None,
        published_at: datetime | None = None,
        additional_context: str | None = None,
    ) -> ExtractionResult:
        """Process a document through the full extraction pipeline.

        Args:
            content: The document text content
            source_url: URL of the source (if available)
            source_type: Classification of the source
            source_title: Title of the source
            source_author: Author of the source
            published_at: Publication date
            additional_context: Additional context for extraction

        Returns:
            ExtractionResult with counts and details
        """
        import time
        start_time = time.time()

        result = ExtractionResult(
            source_id=uuid4(),
            claims_extracted=0,
            claims_matched=0,
            claims_created=0,
            instances_created=0,
        )

        try:
            # Step 1: Check for duplicate source
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            existing_source = await self._repository._document.get_source_by_hash(content_hash)
            if existing_source:
                logger.info("Source already processed", source_id=str(existing_source.id))
                result.source_id = existing_source.id
                result.errors.append("Source already processed (duplicate content)")
                return result

            # Step 2: Store the source
            source = SourceModel(
                id=result.source_id,
                url=source_url,
                source_type=source_type.value,
                title=source_title or source_url or "Untitled",
                author=source_author,
                published_at=published_at,
                content_hash=content_hash,
                raw_content=content,
            )
            await self._repository._document.create_source(source)
            logger.info("Stored source", source_id=str(result.source_id))

            # Step 3: Extract claims
            extraction_result = await self._extractor.execute(ExtractionInput(
                content=content,
                source_type=source_type.value,
                source_title=source_title,
                additional_context=additional_context,
            ))

            extracted_claims = extraction_result.output
            result.claims_extracted = len(extracted_claims)
            logger.info(
                "Extracted claims",
                count=result.claims_extracted,
                source_id=str(result.source_id),
            )

            # Step 4: Process each extracted claim
            for extracted in extracted_claims:
                try:
                    claim_result = await self._process_extracted_claim(
                        extracted=extracted,
                        source_id=result.source_id,
                    )
                    result.details.append(claim_result)

                    if claim_result.get("matched"):
                        result.claims_matched += 1
                    else:
                        result.claims_created += 1
                    result.instances_created += 1

                except Exception as e:
                    error_msg = f"Error processing claim '{extracted.original_text[:50]}...': {str(e)}"
                    result.errors.append(error_msg)
                    logger.error("Error processing claim", error=str(e))

        except Exception as e:
            result.errors.append(f"Pipeline error: {str(e)}")
            logger.error("Pipeline error", error=str(e))

        result.processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            "Extraction pipeline complete",
            source_id=str(result.source_id),
            claims_extracted=result.claims_extracted,
            claims_matched=result.claims_matched,
            claims_created=result.claims_created,
            instances_created=result.instances_created,
            errors=len(result.errors),
            processing_time_ms=result.processing_time_ms,
        )

        return result

    async def _process_extracted_claim(
        self,
        extracted: ExtractedClaim,
        source_id: UUID,
    ) -> dict[str, Any]:
        """Process a single extracted claim.

        Args:
            extracted: The extracted claim
            source_id: ID of the source document

        Returns:
            Dict with processing details
        """
        result: dict[str, Any] = {
            "original_text": extracted.original_text,
            "proposed_canonical": extracted.proposed_canonical_form,
            "matched": False,
            "claim_id": None,
            "instance_id": None,
        }

        # Skip low confidence extractions if configured
        if self._config.skip_low_confidence and extracted.confidence < self._config.min_extraction_confidence:
            result["skipped"] = True
            result["skip_reason"] = f"Low confidence: {extracted.confidence}"
            return result

        # Find candidate matches via vector search
        candidates = await self._vector.search_similar(
            extracted.proposed_canonical_form,
            limit=self._config.matching_top_k,
        )

        # Filter candidates by threshold
        candidates = [c for c in candidates if c.score >= self._config.matching_threshold]

        # Run matcher
        match_result = await self._matcher.execute(MatchingInput(
            extracted_claim=extracted,
            candidates=candidates,
        ))

        if match_result.output.matched_claim_id:
            # Matched existing claim
            result["matched"] = True
            result["claim_id"] = match_result.output.matched_claim_id
            result["match_confidence"] = match_result.output.confidence
        else:
            # Create new claim
            claim_type = self._parse_claim_type(extracted.claim_type)
            new_claim = Claim(
                canonical_form=match_result.output.new_canonical_form or extracted.proposed_canonical_form,
                claim_type=claim_type,
                state=ClaimState.CREATED,
                created_by="extractor",
            )
            await self._repository.create_claim(new_claim)
            result["claim_id"] = new_claim.id
            result["new_canonical"] = new_claim.canonical_form

        # Create instance linking claim to source
        instance = Instance(
            claim_id=result["claim_id"],
            source_id=source_id,
            original_text=extracted.original_text,
            context=extracted.context,
            location=extracted.source_location,
            confidence=extracted.confidence,
            created_by="extractor",
        )
        await self._repository.add_instance(instance)
        result["instance_id"] = instance.id

        return result

    def _parse_claim_type(self, type_str: str) -> ClaimType:
        """Parse claim type string to enum."""
        type_map = {
            "empirical_verifiable": ClaimType.EMPIRICAL_VERIFIABLE,
            "empirical_derived": ClaimType.EMPIRICAL_DERIVED,
            "definitional": ClaimType.DEFINITIONAL,
            "evaluative": ClaimType.EVALUATIVE,
            "causal": ClaimType.CAUSAL,
            "normative": ClaimType.NORMATIVE,
        }
        return type_map.get(type_str.lower(), ClaimType.EMPIRICAL_DERIVED)

    async def reprocess_source(self, source_id: UUID) -> ExtractionResult:
        """Reprocess an existing source.

        Useful for re-extracting claims with updated models or prompts.

        Args:
            source_id: ID of the source to reprocess

        Returns:
            ExtractionResult from reprocessing
        """
        source = await self._repository._document.get_source(source_id)
        if source is None:
            return ExtractionResult(
                source_id=source_id,
                claims_extracted=0,
                claims_matched=0,
                claims_created=0,
                instances_created=0,
                errors=["Source not found"],
            )

        if source.raw_content is None:
            return ExtractionResult(
                source_id=source_id,
                claims_extracted=0,
                claims_matched=0,
                claims_created=0,
                instances_created=0,
                errors=["Source has no stored content"],
            )

        return await self.process_document(
            content=source.raw_content,
            source_url=source.url,
            source_type=SourceType(source.source_type),
            source_title=source.title,
            source_author=source.author,
            published_at=source.published_at,
        )
