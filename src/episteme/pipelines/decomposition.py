"""Decomposition pipeline for building claim dependency trees.

The decomposition pipeline orchestrates:
1. Taking a claim (new or existing)
2. Decomposing it into subclaims via DecomposerAgent
3. Matching subclaims to existing claims or creating new ones
4. Building the graph edges connecting claims
5. Recursively decomposing subclaims to desired depth

This is the second stage after extraction, building the dependency structure
that enables systematic assessment.
"""

import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim, Decomposition, SubClaim
from episteme.domain.enums import ClaimState, ClaimType, DecompositionRelation
from episteme.llm.agents.decomposer import DecomposerAgent, DecompositionInput
from episteme.llm.agents.matcher import MatcherAgent, MatchingInput
from episteme.domain.instance import ExtractedClaim
from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.storage.vector.client import VectorClient
from episteme.config import get_settings

logger = structlog.get_logger()


@dataclass
class DecompositionStats:
    """Statistics from a decomposition run."""

    claims_processed: int = 0
    subclaims_found: int = 0
    subclaims_matched: int = 0
    subclaims_created: int = 0
    decompositions_added: int = 0
    atomic_claims: int = 0
    max_depth_reached: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class DecompositionPipelineResult:
    """Result from the decomposition pipeline."""

    root_claim_id: UUID
    stats: DecompositionStats
    processing_time_ms: float = 0.0
    tree_depth: int = 0


@dataclass
class PipelineConfig:
    """Configuration for the decomposition pipeline."""

    max_depth: int = 5
    matching_threshold: float = 0.85
    matching_top_k: int = 20
    skip_already_decomposed: bool = True
    stop_on_error: bool = False


class DecompositionPipeline:
    """Pipeline for decomposing claims into dependency trees.

    Orchestrates the recursive decomposition of claims:

    1. **Decompose**: Use DecomposerAgent to identify subclaims
    2. **Match**: Use MatcherAgent to match subclaims to existing claims
    3. **Create**: Create new claims for unmatched subclaims
    4. **Link**: Add decomposition edges in the graph
    5. **Recurse**: Repeat for non-atomic subclaims

    Example:
        ```python
        pipeline = DecompositionPipeline(
            repository=claim_repo,
            vector_client=vector_client,
        )

        result = await pipeline.decompose_claim(claim_id)

        print(f"Created {result.stats.subclaims_created} new claims")
        print(f"Tree depth: {result.tree_depth}")
        ```
    """

    def __init__(
        self,
        repository: ClaimRepository,
        vector_client: VectorClient,
        decomposer: DecomposerAgent | None = None,
        matcher: MatcherAgent | None = None,
        config: PipelineConfig | None = None,
    ) -> None:
        """Initialize the decomposition pipeline.

        Args:
            repository: Claim repository for storage operations
            vector_client: Vector client for similarity search
            decomposer: Decomposer agent (creates one if not provided)
            matcher: Matcher agent (creates one if not provided)
            config: Pipeline configuration
        """
        self._repository = repository
        self._vector = vector_client
        self._decomposer = decomposer or DecomposerAgent(repository=repository)
        self._matcher = matcher or MatcherAgent()
        self._config = config or PipelineConfig()
        self._settings = get_settings()

    async def decompose_claim(
        self,
        claim_id: UUID,
        context: str | None = None,
    ) -> DecompositionPipelineResult:
        """Decompose a claim and all its subclaims recursively.

        Args:
            claim_id: ID of the claim to decompose
            context: Optional context for decomposition

        Returns:
            DecompositionPipelineResult with stats and tree depth
        """
        start_time = time.time()

        claim = await self._repository.get_claim(claim_id)
        if claim is None:
            return DecompositionPipelineResult(
                root_claim_id=claim_id,
                stats=DecompositionStats(errors=["Claim not found"]),
            )

        stats = DecompositionStats()
        max_depth = await self._decompose_recursive(
            claim=claim,
            context=context,
            stats=stats,
            current_depth=0,
            visited=set(),
        )

        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            "Decomposition pipeline complete",
            root_claim_id=str(claim_id),
            claims_processed=stats.claims_processed,
            subclaims_found=stats.subclaims_found,
            subclaims_created=stats.subclaims_created,
            tree_depth=max_depth,
            processing_time_ms=processing_time_ms,
        )

        return DecompositionPipelineResult(
            root_claim_id=claim_id,
            stats=stats,
            processing_time_ms=processing_time_ms,
            tree_depth=max_depth,
        )

    async def _decompose_recursive(
        self,
        claim: Claim,
        context: str | None,
        stats: DecompositionStats,
        current_depth: int,
        visited: set[UUID],
    ) -> int:
        """Recursively decompose a claim and its subclaims.

        Args:
            claim: The claim to decompose
            context: Optional context
            stats: Stats to update
            current_depth: Current depth in the tree
            visited: Set of already-visited claim IDs (cycle detection)

        Returns:
            Maximum depth reached
        """
        # Check depth limit
        if current_depth >= self._config.max_depth:
            stats.max_depth_reached = max(stats.max_depth_reached, current_depth)
            return current_depth

        # Cycle detection
        if claim.id in visited:
            logger.warning("Cycle detected in decomposition", claim_id=str(claim.id))
            return current_depth

        visited.add(claim.id)
        stats.claims_processed += 1

        # Check if already decomposed
        if self._config.skip_already_decomposed:
            existing_subclaims = await self._repository.get_subclaims(claim.id)
            if existing_subclaims:
                logger.debug(
                    "Claim already decomposed, skipping",
                    claim_id=str(claim.id),
                    subclaim_count=len(existing_subclaims),
                )
                # Still recurse into existing subclaims
                max_child_depth = current_depth
                for subclaim, _ in existing_subclaims:
                    child_depth = await self._decompose_recursive(
                        claim=subclaim,
                        context=context,
                        stats=stats,
                        current_depth=current_depth + 1,
                        visited=visited,
                    )
                    max_child_depth = max(max_child_depth, child_depth)
                return max_child_depth

        # Decompose the claim
        try:
            decomp_result = await self._decomposer.execute(
                DecompositionInput(
                    claim=claim,
                    context=context,
                    max_depth=self._config.max_depth - current_depth,
                )
            )
        except Exception as e:
            error_msg = f"Decomposition failed for {claim.id}: {str(e)}"
            stats.errors.append(error_msg)
            logger.error("Decomposition failed", claim_id=str(claim.id), error=str(e))
            if self._config.stop_on_error:
                raise
            return current_depth

        # Handle atomic claims
        if decomp_result.output.is_atomic:
            stats.atomic_claims += 1
            logger.debug(
                "Claim is atomic",
                claim_id=str(claim.id),
                atomic_type=decomp_result.output.atomic_type,
            )
            return current_depth

        # Process each subclaim
        stats.subclaims_found += len(decomp_result.output.subclaims)
        max_child_depth = current_depth

        for subclaim in decomp_result.output.subclaims:
            try:
                child_claim, is_new = await self._process_subclaim(
                    subclaim=subclaim,
                    parent_claim_id=claim.id,
                )

                if is_new:
                    stats.subclaims_created += 1
                else:
                    stats.subclaims_matched += 1

                stats.decompositions_added += 1

                # Recurse into the child claim if not atomic
                if not subclaim.is_atomic:
                    child_depth = await self._decompose_recursive(
                        claim=child_claim,
                        context=context,
                        stats=stats,
                        current_depth=current_depth + 1,
                        visited=visited,
                    )
                    max_child_depth = max(max_child_depth, child_depth)

            except Exception as e:
                error_msg = f"Failed processing subclaim '{subclaim.text[:50]}...': {str(e)}"
                stats.errors.append(error_msg)
                logger.error("Subclaim processing failed", error=str(e))
                if self._config.stop_on_error:
                    raise

        return max_child_depth

    async def _process_subclaim(
        self,
        subclaim: SubClaim,
        parent_claim_id: UUID,
    ) -> tuple[Claim, bool]:
        """Process a subclaim: match to existing or create new.

        Args:
            subclaim: The subclaim to process
            parent_claim_id: ID of the parent claim

        Returns:
            Tuple of (claim, is_new) where is_new indicates if claim was created
        """
        # If already matched to existing claim, use that
        if subclaim.existing_claim_id:
            existing = await self._repository.get_claim(subclaim.existing_claim_id)
            if existing:
                await self._add_decomposition(
                    parent_id=parent_claim_id,
                    child_id=existing.id,
                    relation=subclaim.relation,
                    reasoning=subclaim.reasoning,
                    confidence=subclaim.confidence,
                )
                return existing, False

        # Search for similar existing claims
        candidates = await self._vector.search_similar(
            subclaim.text,
            limit=self._config.matching_top_k,
        )

        # Filter by threshold
        candidates = [c for c in candidates if c.score >= self._config.matching_threshold]

        if candidates:
            # Run matcher to determine if any candidate is a match
            extracted = ExtractedClaim(
                original_text=subclaim.text,
                proposed_canonical_form=subclaim.text,
                claim_type=self._infer_claim_type(subclaim.text),
                confidence=subclaim.confidence,
            )

            match_result = await self._matcher.execute(
                MatchingInput(
                    extracted_claim=extracted,
                    candidates=candidates,
                )
            )

            if match_result.output.matched_claim_id:
                matched_claim = await self._repository.get_claim(
                    match_result.output.matched_claim_id
                )
                if matched_claim:
                    await self._add_decomposition(
                        parent_id=parent_claim_id,
                        child_id=matched_claim.id,
                        relation=subclaim.relation,
                        reasoning=subclaim.reasoning,
                        confidence=subclaim.confidence,
                    )
                    return matched_claim, False

        # Create new claim
        new_claim = Claim(
            canonical_form=subclaim.text,
            claim_type=self._infer_claim_type(subclaim.text),
            state=ClaimState.CREATED,
            created_by="decomposer",
        )
        await self._repository.create_claim(new_claim)

        # Add decomposition edge
        await self._add_decomposition(
            parent_id=parent_claim_id,
            child_id=new_claim.id,
            relation=subclaim.relation,
            reasoning=subclaim.reasoning,
            confidence=subclaim.confidence,
        )

        return new_claim, True

    async def _add_decomposition(
        self,
        parent_id: UUID,
        child_id: UUID,
        relation: DecompositionRelation,
        reasoning: str,
        confidence: float,
    ) -> None:
        """Add a decomposition edge between claims."""
        decomposition = Decomposition(
            parent_claim_id=parent_id,
            child_claim_id=child_id,
            relation=relation,
            reasoning=reasoning,
            confidence=confidence,
            created_by="decomposer",
        )
        await self._repository.add_decomposition(decomposition)

    def _infer_claim_type(self, text: str) -> ClaimType:
        """Infer claim type from text (simple heuristic).

        A more sophisticated version would use the LLM.
        """
        text_lower = text.lower()

        # Check for normative indicators
        if any(word in text_lower for word in ["should", "ought", "must", "need to"]):
            return ClaimType.NORMATIVE

        # Check for causal indicators
        if any(word in text_lower for word in ["causes", "leads to", "results in", "because"]):
            return ClaimType.CAUSAL

        # Check for evaluative indicators
        if any(word in text_lower for word in ["good", "bad", "better", "worse", "best", "worst"]):
            return ClaimType.EVALUATIVE

        # Check for definitional indicators
        if any(phrase in text_lower for phrase in ["is defined as", "means", "refers to"]):
            return ClaimType.DEFINITIONAL

        # Check for verifiable indicators (specific data sources)
        if any(word in text_lower for word in ["reported", "published", "according to"]):
            return ClaimType.EMPIRICAL_VERIFIABLE

        # Default to empirical derived
        return ClaimType.EMPIRICAL_DERIVED

    async def decompose_batch(
        self,
        claim_ids: list[UUID],
        context: str | None = None,
    ) -> list[DecompositionPipelineResult]:
        """Decompose multiple claims.

        Args:
            claim_ids: List of claim IDs to decompose
            context: Optional shared context

        Returns:
            List of results for each claim
        """
        results = []
        for claim_id in claim_ids:
            result = await self.decompose_claim(claim_id, context)
            results.append(result)
        return results

    async def decompose_new_claim(
        self,
        canonical_form: str,
        claim_type: ClaimType = ClaimType.EMPIRICAL_DERIVED,
        context: str | None = None,
    ) -> DecompositionPipelineResult:
        """Create and decompose a new claim.

        Args:
            canonical_form: The claim's canonical form
            claim_type: Type of the claim
            context: Optional context for decomposition

        Returns:
            DecompositionPipelineResult
        """
        # Create the claim
        claim = Claim(
            canonical_form=canonical_form,
            claim_type=claim_type,
            state=ClaimState.CREATED,
            created_by="decomposition_pipeline",
        )
        await self._repository.create_claim(claim)

        # Decompose it
        return await self.decompose_claim(claim.id, context)

    async def get_decomposition_summary(
        self,
        claim_id: UUID,
    ) -> dict[str, Any]:
        """Get a summary of a claim's decomposition.

        Args:
            claim_id: The claim ID

        Returns:
            Summary dict with tree structure info
        """
        tree = await self._repository.get_claim_tree(claim_id)
        if tree is None:
            return {"error": "Claim not found"}

        return {
            "root_claim_id": str(claim_id),
            "root_canonical_form": tree.claim.canonical_form,
            "total_claims": len(tree.get_all_claims()),
            "leaf_claims": len(tree.get_leaf_claims()),
            "max_depth": tree.max_depth(),
            "is_fully_decomposed": tree.is_leaf or all(
                child.is_leaf for child, _ in tree.children
            ),
        }
