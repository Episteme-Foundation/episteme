"""Neo4j client for claim graph operations.

This client manages the graph database that stores:
- Claims as nodes
- Decomposition relationships as edges
- Assessment history
- Instance links
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from uuid import UUID

import structlog
from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from neo4j.exceptions import Neo4jError

from episteme.config import get_settings
from episteme.domain.claim import Claim, ClaimTree, Decomposition
from episteme.domain.enums import ClaimState, DecompositionRelation

logger = structlog.get_logger()


class Neo4jClient:
    """Async client for Neo4j graph database operations.

    Manages claim nodes, decomposition edges, and graph traversals.

    Example:
        ```python
        async with Neo4jClient() as client:
            claim_id = await client.create_claim(claim)
            tree = await client.get_claim_tree(claim_id, depth=3)
        ```
    """

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> None:
        """Initialize the Neo4j client.

        Args:
            uri: Neo4j connection URI (defaults to config)
            user: Neo4j username (defaults to config)
            password: Neo4j password (defaults to config)
        """
        settings = get_settings()
        self._uri = uri or settings.database.neo4j_uri
        self._user = user or settings.database.neo4j_user
        self._password = password or settings.database.neo4j_password.get_secret_value()
        self._driver: AsyncDriver | None = None

    async def connect(self) -> None:
        """Establish connection to Neo4j."""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self._uri,
                auth=(self._user, self._password),
            )
            # Verify connectivity
            await self._driver.verify_connectivity()
            logger.info("Connected to Neo4j", uri=self._uri)

    async def close(self) -> None:
        """Close the Neo4j connection."""
        if self._driver is not None:
            await self._driver.close()
            self._driver = None
            logger.info("Disconnected from Neo4j")

    async def __aenter__(self) -> "Neo4jClient":
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()

    @asynccontextmanager
    async def _session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get a database session."""
        if self._driver is None:
            await self.connect()
        assert self._driver is not None
        async with self._driver.session() as session:
            yield session

    # =========================================================================
    # Schema Management
    # =========================================================================

    async def initialize_schema(self) -> None:
        """Create indexes and constraints for the graph schema."""
        async with self._session() as session:
            # Unique constraint on Claim.id
            await session.run(
                "CREATE CONSTRAINT claim_id IF NOT EXISTS "
                "FOR (c:Claim) REQUIRE c.id IS UNIQUE"
            )
            # Index on Claim.state for filtering
            await session.run(
                "CREATE INDEX claim_state IF NOT EXISTS "
                "FOR (c:Claim) ON (c.state)"
            )
            # Index on Claim.canonical_form for text search
            await session.run(
                "CREATE INDEX claim_canonical IF NOT EXISTS "
                "FOR (c:Claim) ON (c.canonical_form)"
            )
            # Unique constraint on Decomposition.id
            await session.run(
                "CREATE CONSTRAINT decomposition_id IF NOT EXISTS "
                "FOR ()-[d:DECOMPOSES_TO]-() REQUIRE d.id IS UNIQUE"
            )
            logger.info("Neo4j schema initialized")

    # =========================================================================
    # Claim Operations
    # =========================================================================

    async def create_claim(self, claim: Claim) -> UUID:
        """Create a new claim node in the graph.

        Args:
            claim: The claim to create

        Returns:
            The claim's UUID
        """
        query = """
        CREATE (c:Claim {
            id: $id,
            canonical_form: $canonical_form,
            claim_type: $claim_type,
            state: $state,
            merged_into: $merged_into,
            created_at: datetime($created_at),
            updated_at: datetime($updated_at),
            created_by: $created_by,
            alternative_forms: $alternative_forms
        })
        RETURN c.id as id
        """
        async with self._session() as session:
            result = await session.run(
                query,
                id=str(claim.id),
                canonical_form=claim.canonical_form,
                claim_type=claim.claim_type.value,
                state=claim.state.value,
                merged_into=str(claim.merged_into) if claim.merged_into else None,
                created_at=claim.created_at.isoformat(),
                updated_at=claim.updated_at.isoformat(),
                created_by=claim.created_by,
                alternative_forms=claim.alternative_forms,
            )
            record = await result.single()
            logger.info("Created claim", claim_id=str(claim.id))
            return claim.id

    async def get_claim(self, claim_id: UUID) -> Claim | None:
        """Retrieve a claim by ID.

        Args:
            claim_id: The claim's UUID

        Returns:
            The claim if found, None otherwise
        """
        query = """
        MATCH (c:Claim {id: $id})
        RETURN c
        """
        async with self._session() as session:
            result = await session.run(query, id=str(claim_id))
            record = await result.single()
            if record is None:
                return None
            return self._node_to_claim(record["c"])

    async def update_claim(self, claim: Claim) -> bool:
        """Update an existing claim.

        Args:
            claim: The claim with updated fields

        Returns:
            True if updated, False if not found
        """
        query = """
        MATCH (c:Claim {id: $id})
        SET c.canonical_form = $canonical_form,
            c.claim_type = $claim_type,
            c.state = $state,
            c.merged_into = $merged_into,
            c.updated_at = datetime($updated_at),
            c.alternative_forms = $alternative_forms
        RETURN c.id as id
        """
        async with self._session() as session:
            result = await session.run(
                query,
                id=str(claim.id),
                canonical_form=claim.canonical_form,
                claim_type=claim.claim_type.value,
                state=claim.state.value,
                merged_into=str(claim.merged_into) if claim.merged_into else None,
                updated_at=claim.updated_at.isoformat(),
                alternative_forms=claim.alternative_forms,
            )
            record = await result.single()
            if record:
                logger.info("Updated claim", claim_id=str(claim.id))
                return True
            return False

    async def delete_claim(self, claim_id: UUID) -> bool:
        """Delete a claim and its relationships.

        Args:
            claim_id: The claim's UUID

        Returns:
            True if deleted, False if not found
        """
        query = """
        MATCH (c:Claim {id: $id})
        DETACH DELETE c
        RETURN count(c) as deleted
        """
        async with self._session() as session:
            result = await session.run(query, id=str(claim_id))
            record = await result.single()
            deleted = record["deleted"] > 0 if record else False
            if deleted:
                logger.info("Deleted claim", claim_id=str(claim_id))
            return deleted

    async def list_claims(
        self,
        state: ClaimState | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Claim]:
        """List claims with optional filtering.

        Args:
            state: Filter by claim state
            limit: Maximum number of claims to return
            offset: Number of claims to skip

        Returns:
            List of claims
        """
        if state:
            query = """
            MATCH (c:Claim {state: $state})
            RETURN c
            ORDER BY c.updated_at DESC
            SKIP $offset
            LIMIT $limit
            """
            params = {"state": state.value, "limit": limit, "offset": offset}
        else:
            query = """
            MATCH (c:Claim)
            RETURN c
            ORDER BY c.updated_at DESC
            SKIP $offset
            LIMIT $limit
            """
            params = {"limit": limit, "offset": offset}

        async with self._session() as session:
            result = await session.run(query, **params)
            records = await result.data()
            return [self._node_to_claim(r["c"]) for r in records]

    # =========================================================================
    # Decomposition Operations
    # =========================================================================

    async def add_decomposition(self, decomposition: Decomposition) -> UUID:
        """Add a decomposition relationship between claims.

        Args:
            decomposition: The decomposition relationship

        Returns:
            The decomposition's UUID
        """
        query = """
        MATCH (parent:Claim {id: $parent_id})
        MATCH (child:Claim {id: $child_id})
        CREATE (parent)-[d:DECOMPOSES_TO {
            id: $id,
            relation: $relation,
            reasoning: $reasoning,
            confidence: $confidence,
            created_at: datetime($created_at),
            created_by: $created_by
        }]->(child)
        RETURN d.id as id
        """
        async with self._session() as session:
            result = await session.run(
                query,
                parent_id=str(decomposition.parent_claim_id),
                child_id=str(decomposition.child_claim_id),
                id=str(decomposition.id),
                relation=decomposition.relation.value,
                reasoning=decomposition.reasoning,
                confidence=decomposition.confidence,
                created_at=decomposition.created_at.isoformat(),
                created_by=decomposition.created_by,
            )
            record = await result.single()
            logger.info(
                "Added decomposition",
                decomposition_id=str(decomposition.id),
                parent=str(decomposition.parent_claim_id),
                child=str(decomposition.child_claim_id),
            )
            return decomposition.id

    async def get_subclaims(self, claim_id: UUID) -> list[tuple[Claim, Decomposition]]:
        """Get all direct subclaims of a claim.

        Args:
            claim_id: The parent claim's UUID

        Returns:
            List of (subclaim, decomposition) tuples
        """
        query = """
        MATCH (parent:Claim {id: $id})-[d:DECOMPOSES_TO]->(child:Claim)
        RETURN child, d
        ORDER BY d.created_at
        """
        async with self._session() as session:
            result = await session.run(query, id=str(claim_id))
            records = await result.data()
            return [
                (self._node_to_claim(r["child"]), self._rel_to_decomposition(r["d"], claim_id))
                for r in records
            ]

    async def get_parent_claims(self, claim_id: UUID) -> list[tuple[Claim, Decomposition]]:
        """Get all claims that have this claim as a subclaim.

        Args:
            claim_id: The child claim's UUID

        Returns:
            List of (parent_claim, decomposition) tuples
        """
        query = """
        MATCH (parent:Claim)-[d:DECOMPOSES_TO]->(child:Claim {id: $id})
        RETURN parent, d
        ORDER BY d.created_at
        """
        async with self._session() as session:
            result = await session.run(query, id=str(claim_id))
            records = await result.data()
            return [
                (self._node_to_claim(r["parent"]), self._rel_to_decomposition(r["d"], UUID(r["parent"]["id"])))
                for r in records
            ]

    async def get_claim_tree(self, claim_id: UUID, max_depth: int = 5) -> ClaimTree | None:
        """Get a claim with its full decomposition tree.

        Args:
            claim_id: The root claim's UUID
            max_depth: Maximum depth to traverse

        Returns:
            ClaimTree if found, None otherwise
        """
        claim = await self.get_claim(claim_id)
        if claim is None:
            return None

        return await self._build_tree(claim, depth=0, max_depth=max_depth)

    async def _build_tree(
        self,
        claim: Claim,
        depth: int,
        max_depth: int,
    ) -> ClaimTree:
        """Recursively build a claim tree."""
        if depth >= max_depth:
            return ClaimTree(claim=claim, depth=depth, is_leaf=True)

        subclaims = await self.get_subclaims(claim.id)
        if not subclaims:
            return ClaimTree(claim=claim, depth=depth, is_leaf=True)

        children: list[tuple[ClaimTree, Decomposition]] = []
        for child_claim, decomposition in subclaims:
            child_tree = await self._build_tree(child_claim, depth + 1, max_depth)
            children.append((child_tree, decomposition))

        return ClaimTree(
            claim=claim,
            children=children,
            depth=depth,
            is_leaf=False,
        )

    async def check_circular_dependency(
        self,
        parent_id: UUID,
        child_id: UUID,
    ) -> bool:
        """Check if adding a decomposition would create a cycle.

        Args:
            parent_id: The parent claim's UUID
            child_id: The proposed child claim's UUID

        Returns:
            True if adding this edge would create a cycle
        """
        # Check if child can reach parent (would create cycle)
        query = """
        MATCH path = (child:Claim {id: $child_id})-[:DECOMPOSES_TO*]->(parent:Claim {id: $parent_id})
        RETURN count(path) > 0 as has_cycle
        """
        async with self._session() as session:
            result = await session.run(
                query,
                parent_id=str(parent_id),
                child_id=str(child_id),
            )
            record = await result.single()
            return record["has_cycle"] if record else False

    # =========================================================================
    # Graph Queries
    # =========================================================================

    async def find_related_claims(
        self,
        claim_id: UUID,
        max_hops: int = 2,
    ) -> list[Claim]:
        """Find claims related to a given claim within N hops.

        Args:
            claim_id: The starting claim's UUID
            max_hops: Maximum number of relationship hops

        Returns:
            List of related claims
        """
        query = """
        MATCH (start:Claim {id: $id})-[:DECOMPOSES_TO*1..$max_hops]-(related:Claim)
        WHERE related.id <> $id
        RETURN DISTINCT related
        """
        async with self._session() as session:
            result = await session.run(
                query,
                id=str(claim_id),
                max_hops=max_hops,
            )
            records = await result.data()
            return [self._node_to_claim(r["related"]) for r in records]

    async def get_leaf_claims(self, claim_id: UUID) -> list[Claim]:
        """Get all leaf claims (no children) in a claim's decomposition tree.

        Args:
            claim_id: The root claim's UUID

        Returns:
            List of leaf claims
        """
        query = """
        MATCH (root:Claim {id: $id})-[:DECOMPOSES_TO*]->(leaf:Claim)
        WHERE NOT (leaf)-[:DECOMPOSES_TO]->()
        RETURN DISTINCT leaf
        """
        async with self._session() as session:
            result = await session.run(query, id=str(claim_id))
            records = await result.data()
            return [self._node_to_claim(r["leaf"]) for r in records]

    async def count_claims(self, state: ClaimState | None = None) -> int:
        """Count claims in the graph.

        Args:
            state: Optional filter by state

        Returns:
            Number of claims
        """
        if state:
            query = "MATCH (c:Claim {state: $state}) RETURN count(c) as count"
            params = {"state": state.value}
        else:
            query = "MATCH (c:Claim) RETURN count(c) as count"
            params = {}

        async with self._session() as session:
            result = await session.run(query, **params)
            record = await result.single()
            return record["count"] if record else 0

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _node_to_claim(self, node: dict) -> Claim:
        """Convert a Neo4j node to a Claim object."""
        from datetime import datetime

        return Claim(
            id=UUID(node["id"]),
            canonical_form=node["canonical_form"],
            claim_type=node["claim_type"],
            state=ClaimState(node["state"]),
            merged_into=UUID(node["merged_into"]) if node.get("merged_into") else None,
            created_at=datetime.fromisoformat(str(node["created_at"])),
            updated_at=datetime.fromisoformat(str(node["updated_at"])),
            created_by=node["created_by"],
            alternative_forms=node.get("alternative_forms", []),
        )

    def _rel_to_decomposition(self, rel: dict, parent_id: UUID) -> Decomposition:
        """Convert a Neo4j relationship to a Decomposition object."""
        from datetime import datetime

        return Decomposition(
            id=UUID(rel["id"]),
            parent_claim_id=parent_id,
            child_claim_id=UUID(rel.get("child_id", "")),  # May need adjustment
            relation=DecompositionRelation(rel["relation"]),
            reasoning=rel["reasoning"],
            confidence=rel["confidence"],
            created_at=datetime.fromisoformat(str(rel["created_at"])),
            created_by=rel["created_by"],
        )
