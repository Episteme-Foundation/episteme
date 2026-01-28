"""Claim repository coordinating graph, vector, and document stores.

The ClaimRepository provides a unified interface for claim operations,
managing data consistency across Neo4j (graph), Pinecone/Qdrant (vectors),
and PostgreSQL (documents).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.claim import Claim, ClaimTree, Decomposition
from episteme.domain.instance import Instance, Source
from episteme.domain.assessment import Assessment
from episteme.domain.enums import AssessmentStatus, ClaimState
from episteme.storage.graph.client import Neo4jClient
from episteme.storage.vector.client import VectorClient, SimilarClaim
from episteme.storage.document.client import DocumentClient
from episteme.storage.document.models import (
    SourceModel,
    InstanceModel,
    AssessmentModel,
)

logger = structlog.get_logger()


@dataclass
class ClaimWithContext:
    """A claim with its associated context from all stores."""

    claim: Claim
    instances: list[Instance]
    current_assessment: Assessment | None
    similar_claims: list[SimilarClaim]


class ClaimRepository:
    """Unified repository for claim operations across all storage backends.

    Coordinates:
    - Neo4j: Claim nodes, decomposition relationships
    - Vector DB: Claim embeddings for semantic search
    - PostgreSQL: Sources, instances, assessments, audit logs

    Example:
        ```python
        repo = ClaimRepository(neo4j, vector, document)
        await repo.initialize()

        # Create a claim (stored in graph + vector)
        claim_id = await repo.create_claim(claim)

        # Search for similar claims
        similar = await repo.find_similar_claims("Earth is 4.5 billion years old")

        # Get full context
        context = await repo.get_claim_with_context(claim_id)
        ```
    """

    def __init__(
        self,
        graph_client: Neo4jClient,
        vector_client: VectorClient,
        document_client: DocumentClient,
    ) -> None:
        """Initialize the claim repository.

        Args:
            graph_client: Neo4j client for graph operations
            vector_client: Vector client for semantic search
            document_client: PostgreSQL client for documents
        """
        self._graph = graph_client
        self._vector = vector_client
        self._document = document_client

    async def initialize(self) -> None:
        """Initialize all storage backends."""
        await self._graph.initialize_schema()
        await self._vector.initialize()
        await self._document.initialize_schema()
        logger.info("Claim repository initialized")

    # =========================================================================
    # Claim CRUD Operations
    # =========================================================================

    async def create_claim(
        self,
        claim: Claim,
        log_action: bool = True,
    ) -> UUID:
        """Create a new claim in graph and vector stores.

        Args:
            claim: The claim to create
            log_action: Whether to log to audit log

        Returns:
            The claim's UUID
        """
        # Store in graph
        await self._graph.create_claim(claim)

        # Store embedding in vector DB
        await self._vector.upsert_claim(
            claim_id=claim.id,
            canonical_form=claim.canonical_form,
            metadata={
                "claim_type": claim.claim_type.value,
                "state": claim.state.value,
            },
        )

        # Log action
        if log_action:
            await self._document.log_action(
                agent=claim.created_by,
                action="create_claim",
                entity_type="claim",
                entity_id=claim.id,
                details={
                    "canonical_form": claim.canonical_form,
                    "claim_type": claim.claim_type.value,
                },
            )

        logger.info("Created claim in all stores", claim_id=str(claim.id))
        return claim.id

    async def get_claim(self, claim_id: UUID) -> Claim | None:
        """Get a claim by ID.

        Args:
            claim_id: The claim's UUID

        Returns:
            The claim if found, None otherwise
        """
        return await self._graph.get_claim(claim_id)

    async def update_claim(
        self,
        claim: Claim,
        log_action: bool = True,
    ) -> bool:
        """Update a claim in graph and vector stores.

        Args:
            claim: The claim with updated fields
            log_action: Whether to log to audit log

        Returns:
            True if updated, False if not found
        """
        # Update in graph
        updated = await self._graph.update_claim(claim)
        if not updated:
            return False

        # Update embedding in vector DB
        await self._vector.upsert_claim(
            claim_id=claim.id,
            canonical_form=claim.canonical_form,
            metadata={
                "claim_type": claim.claim_type.value,
                "state": claim.state.value,
            },
        )

        # Log action
        if log_action:
            await self._document.log_action(
                agent="system",
                action="update_claim",
                entity_type="claim",
                entity_id=claim.id,
                details={
                    "canonical_form": claim.canonical_form,
                    "state": claim.state.value,
                },
            )

        return True

    async def delete_claim(
        self,
        claim_id: UUID,
        log_action: bool = True,
    ) -> bool:
        """Delete a claim from all stores.

        Note: This is a hard delete. Consider using deprecate_claim() instead.

        Args:
            claim_id: The claim's UUID
            log_action: Whether to log to audit log

        Returns:
            True if deleted, False if not found
        """
        # Delete from graph (includes relationships)
        deleted = await self._graph.delete_claim(claim_id)
        if not deleted:
            return False

        # Delete from vector DB
        await self._vector.delete_claim(claim_id)

        # Log action
        if log_action:
            await self._document.log_action(
                agent="system",
                action="delete_claim",
                entity_type="claim",
                entity_id=claim_id,
            )

        return True

    async def deprecate_claim(
        self,
        claim_id: UUID,
        reason: str,
        agent: str = "system",
    ) -> bool:
        """Deprecate a claim (soft delete).

        Args:
            claim_id: The claim's UUID
            reason: Reason for deprecation
            agent: Agent performing the action

        Returns:
            True if deprecated, False if not found
        """
        claim = await self._graph.get_claim(claim_id)
        if claim is None:
            return False

        claim.deprecate()
        await self._graph.update_claim(claim)

        # Log action
        await self._document.log_action(
            agent=agent,
            action="deprecate_claim",
            entity_type="claim",
            entity_id=claim_id,
            reasoning=reason,
        )

        return True

    async def merge_claims(
        self,
        source_id: UUID,
        target_id: UUID,
        reason: str,
        agent: str = "system",
    ) -> bool:
        """Merge one claim into another.

        The source claim is marked as merged, and its instances are
        re-linked to the target claim.

        Args:
            source_id: Claim to merge (will be marked as merged)
            target_id: Claim to merge into
            reason: Reason for merge
            agent: Agent performing the merge

        Returns:
            True if merged, False if either claim not found
        """
        source = await self._graph.get_claim(source_id)
        target = await self._graph.get_claim(target_id)

        if source is None or target is None:
            return False

        # Mark source as merged
        source.merge_into(target_id)
        await self._graph.update_claim(source)

        # Add source's canonical form as alternative on target
        if source.canonical_form not in target.alternative_forms:
            target.alternative_forms.append(source.canonical_form)
            target.updated_at = datetime.utcnow()
            await self._graph.update_claim(target)

        # Log action
        await self._document.log_action(
            agent=agent,
            action="merge_claims",
            entity_type="claim",
            entity_id=source_id,
            details={"merged_into": str(target_id)},
            reasoning=reason,
        )

        logger.info(
            "Merged claims",
            source_id=str(source_id),
            target_id=str(target_id),
        )
        return True

    # =========================================================================
    # Decomposition Operations
    # =========================================================================

    async def add_decomposition(
        self,
        decomposition: Decomposition,
        log_action: bool = True,
    ) -> UUID:
        """Add a decomposition relationship.

        Checks for circular dependencies before adding.

        Args:
            decomposition: The decomposition to add
            log_action: Whether to log to audit log

        Returns:
            The decomposition's UUID

        Raises:
            ValueError: If this would create a circular dependency
        """
        # Check for cycles
        would_cycle = await self._graph.check_circular_dependency(
            decomposition.parent_claim_id,
            decomposition.child_claim_id,
        )
        if would_cycle:
            raise ValueError(
                f"Adding decomposition would create cycle: "
                f"{decomposition.parent_claim_id} -> {decomposition.child_claim_id}"
            )

        # Add to graph
        await self._graph.add_decomposition(decomposition)

        # Log action
        if log_action:
            await self._document.log_action(
                agent=decomposition.created_by,
                action="add_decomposition",
                entity_type="decomposition",
                entity_id=decomposition.id,
                details={
                    "parent_claim_id": str(decomposition.parent_claim_id),
                    "child_claim_id": str(decomposition.child_claim_id),
                    "relation": decomposition.relation.value,
                },
                reasoning=decomposition.reasoning,
            )

        return decomposition.id

    async def get_claim_tree(
        self,
        claim_id: UUID,
        max_depth: int = 5,
    ) -> ClaimTree | None:
        """Get a claim with its full decomposition tree.

        Args:
            claim_id: The root claim's UUID
            max_depth: Maximum depth to traverse

        Returns:
            ClaimTree if found, None otherwise
        """
        return await self._graph.get_claim_tree(claim_id, max_depth)

    async def get_subclaims(
        self,
        claim_id: UUID,
    ) -> list[tuple[Claim, Decomposition]]:
        """Get direct subclaims of a claim.

        Args:
            claim_id: The parent claim's UUID

        Returns:
            List of (subclaim, decomposition) tuples
        """
        return await self._graph.get_subclaims(claim_id)

    async def get_parent_claims(
        self,
        claim_id: UUID,
    ) -> list[tuple[Claim, Decomposition]]:
        """Get claims that have this claim as a subclaim.

        Args:
            claim_id: The child claim's UUID

        Returns:
            List of (parent_claim, decomposition) tuples
        """
        return await self._graph.get_parent_claims(claim_id)

    # =========================================================================
    # Search Operations
    # =========================================================================

    async def find_similar_claims(
        self,
        query: str,
        limit: int = 10,
        state_filter: ClaimState | None = None,
    ) -> list[SimilarClaim]:
        """Find claims semantically similar to a query.

        Args:
            query: Text to search for
            limit: Maximum number of results
            state_filter: Optional filter by claim state

        Returns:
            List of similar claims with scores
        """
        filter_metadata = None
        if state_filter:
            filter_metadata = {"state": state_filter.value}

        return await self._vector.search_similar(query, limit, filter_metadata)

    async def list_claims(
        self,
        state: ClaimState | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Claim]:
        """List claims with optional filtering.

        Args:
            state: Filter by claim state
            limit: Maximum number of claims
            offset: Number of claims to skip

        Returns:
            List of claims
        """
        return await self._graph.list_claims(state, limit, offset)

    # =========================================================================
    # Instance Operations
    # =========================================================================

    async def add_instance(
        self,
        instance: Instance,
        log_action: bool = True,
    ) -> UUID:
        """Add an instance linking a claim to a source.

        Args:
            instance: The instance to add
            log_action: Whether to log to audit log

        Returns:
            The instance's UUID
        """
        # Create in document store
        instance_model = InstanceModel(
            id=instance.id,
            claim_id=instance.claim_id,
            source_id=instance.source_id,
            original_text=instance.original_text,
            context=instance.context,
            location=instance.location,
            confidence=instance.confidence,
            created_at=instance.created_at,
            created_by=instance.created_by,
            metadata=instance.metadata,
        )
        await self._document.create_instance(instance_model)

        # Log action
        if log_action:
            await self._document.log_action(
                agent=instance.created_by,
                action="add_instance",
                entity_type="instance",
                entity_id=instance.id,
                details={
                    "claim_id": str(instance.claim_id),
                    "source_id": str(instance.source_id),
                },
            )

        return instance.id

    async def get_instances_for_claim(
        self,
        claim_id: UUID,
        limit: int = 100,
    ) -> list[Instance]:
        """Get all instances of a claim.

        Args:
            claim_id: The claim's UUID
            limit: Maximum number of instances

        Returns:
            List of instances
        """
        models = await self._document.get_instances_for_claim(claim_id, limit)
        return [self._model_to_instance(m) for m in models]

    # =========================================================================
    # Assessment Operations
    # =========================================================================

    async def add_assessment(
        self,
        assessment: Assessment,
        log_action: bool = True,
    ) -> UUID:
        """Add an assessment for a claim.

        Marks any previous current assessment as superseded.

        Args:
            assessment: The assessment to add
            log_action: Whether to log to audit log

        Returns:
            The assessment's UUID
        """
        # Get previous assessment to link
        previous = await self._document.get_current_assessment(assessment.claim_id)
        if previous:
            assessment.supersedes = previous.id

        # Create in document store
        assessment_model = AssessmentModel(
            id=assessment.id,
            claim_id=assessment.claim_id,
            status=assessment.status.value,
            confidence=assessment.confidence,
            reasoning_trace=assessment.reasoning_trace,
            evidence_for=list(assessment.evidence_for),
            evidence_against=list(assessment.evidence_against),
            assessed_at=assessment.assessed_at,
            assessed_by=assessment.assessed_by,
            supersedes=assessment.supersedes,
            is_current=True,
            subclaim_summary=assessment.subclaim_summary,
        )
        await self._document.create_assessment(assessment_model)

        # Log action
        if log_action:
            await self._document.log_action(
                agent=assessment.assessed_by,
                action="add_assessment",
                entity_type="assessment",
                entity_id=assessment.id,
                details={
                    "claim_id": str(assessment.claim_id),
                    "status": assessment.status.value,
                    "confidence": assessment.confidence,
                },
                reasoning=assessment.reasoning_trace,
            )

        return assessment.id

    async def get_current_assessment(
        self,
        claim_id: UUID,
    ) -> Assessment | None:
        """Get the current assessment for a claim.

        Args:
            claim_id: The claim's UUID

        Returns:
            The current assessment if exists, None otherwise
        """
        model = await self._document.get_current_assessment(claim_id)
        if model is None:
            return None
        return self._model_to_assessment(model)

    # =========================================================================
    # Aggregated Operations
    # =========================================================================

    async def get_claim_with_context(
        self,
        claim_id: UUID,
        include_similar: bool = True,
        similar_limit: int = 5,
    ) -> ClaimWithContext | None:
        """Get a claim with all its associated context.

        Args:
            claim_id: The claim's UUID
            include_similar: Whether to include similar claims
            similar_limit: Number of similar claims to include

        Returns:
            ClaimWithContext if found, None otherwise
        """
        claim = await self._graph.get_claim(claim_id)
        if claim is None:
            return None

        instances = await self.get_instances_for_claim(claim_id)
        assessment = await self.get_current_assessment(claim_id)

        similar: list[SimilarClaim] = []
        if include_similar:
            similar = await self.find_similar_claims(
                claim.canonical_form,
                limit=similar_limit + 1,  # +1 to exclude self
            )
            # Remove self from results
            similar = [s for s in similar if s.claim_id != claim_id][:similar_limit]

        return ClaimWithContext(
            claim=claim,
            instances=instances,
            current_assessment=assessment,
            similar_claims=similar,
        )

    # =========================================================================
    # Statistics
    # =========================================================================

    async def count_claims(self, state: ClaimState | None = None) -> int:
        """Count claims in the graph.

        Args:
            state: Optional filter by state

        Returns:
            Number of claims
        """
        return await self._graph.count_claims(state)

    async def get_statistics(self) -> dict[str, Any]:
        """Get repository statistics.

        Returns:
            Dictionary with counts and stats
        """
        claims_total = await self._graph.count_claims()
        claims_active = await self._graph.count_claims(ClaimState.ACTIVE)
        claims_contested = await self._graph.count_claims(ClaimState.CONTESTED)
        sources = await self._document.count_sources()
        instances = await self._document.count_instances()
        contributions = await self._document.count_contributions_by_status()

        return {
            "claims": {
                "total": claims_total,
                "active": claims_active,
                "contested": claims_contested,
            },
            "sources": sources,
            "instances": instances,
            "contributions": contributions,
        }

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _model_to_instance(self, model: InstanceModel) -> Instance:
        """Convert SQLAlchemy model to domain model."""
        return Instance(
            id=model.id,
            claim_id=model.claim_id,
            source_id=model.source_id,
            original_text=model.original_text,
            context=model.context,
            location=model.location,
            confidence=model.confidence,
            created_at=model.created_at,
            created_by=model.created_by,
            metadata=model.metadata,
        )

    def _model_to_assessment(self, model: AssessmentModel) -> Assessment:
        """Convert SQLAlchemy model to domain model."""
        return Assessment(
            id=model.id,
            claim_id=model.claim_id,
            status=AssessmentStatus(model.status),
            confidence=model.confidence,
            reasoning_trace=model.reasoning_trace,
            evidence_for=list(model.evidence_for),
            evidence_against=list(model.evidence_against),
            assessed_at=model.assessed_at,
            assessed_by=model.assessed_by,
            supersedes=model.supersedes,
            is_current=model.is_current,
            subclaim_summary=model.subclaim_summary,
        )
