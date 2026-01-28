"""Vector database client for semantic claim matching.

Supports both Qdrant (local development) and Pinecone (production).
The client provides a unified interface for storing claim embeddings
and performing similarity searches.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

import structlog

from episteme.config import get_settings
from episteme.storage.vector.embeddings import EmbeddingService

logger = structlog.get_logger()


@dataclass
class SimilarClaim:
    """Result from a similarity search."""

    claim_id: UUID
    score: float
    canonical_form: str | None = None


class VectorStore(ABC):
    """Abstract base class for vector stores."""

    @abstractmethod
    async def upsert(
        self,
        claim_id: UUID,
        embedding: list[float],
        metadata: dict | None = None,
    ) -> None:
        """Insert or update a claim embedding."""
        ...

    @abstractmethod
    async def search(
        self,
        embedding: list[float],
        limit: int = 10,
        filter_metadata: dict | None = None,
    ) -> list[SimilarClaim]:
        """Search for similar claims."""
        ...

    @abstractmethod
    async def delete(self, claim_id: UUID) -> bool:
        """Delete a claim embedding."""
        ...

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the vector store (create collection/index)."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Close connections."""
        ...


class QdrantStore(VectorStore):
    """Qdrant vector store implementation for local development."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6333,
        collection_name: str = "claims",
        dimension: int = 1024,
    ) -> None:
        """Initialize Qdrant store.

        Args:
            host: Qdrant server host
            port: Qdrant server port
            collection_name: Name of the collection
            dimension: Embedding dimension
        """
        self._host = host
        self._port = port
        self._collection_name = collection_name
        self._dimension = dimension
        self._client = None

    async def _get_client(self):
        """Get or create Qdrant client."""
        if self._client is None:
            from qdrant_client import AsyncQdrantClient

            self._client = AsyncQdrantClient(host=self._host, port=self._port)
        return self._client

    async def initialize(self) -> None:
        """Create the collection if it doesn't exist."""
        from qdrant_client.models import Distance, VectorParams

        client = await self._get_client()

        # Check if collection exists
        collections = await client.get_collections()
        exists = any(c.name == self._collection_name for c in collections.collections)

        if not exists:
            await client.create_collection(
                collection_name=self._collection_name,
                vectors_config=VectorParams(
                    size=self._dimension,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("Created Qdrant collection", collection=self._collection_name)
        else:
            logger.info("Qdrant collection exists", collection=self._collection_name)

    async def upsert(
        self,
        claim_id: UUID,
        embedding: list[float],
        metadata: dict | None = None,
    ) -> None:
        """Insert or update a claim embedding."""
        from qdrant_client.models import PointStruct

        client = await self._get_client()

        point = PointStruct(
            id=str(claim_id),
            vector=embedding,
            payload=metadata or {},
        )

        await client.upsert(
            collection_name=self._collection_name,
            points=[point],
        )
        logger.debug("Upserted claim embedding", claim_id=str(claim_id))

    async def search(
        self,
        embedding: list[float],
        limit: int = 10,
        filter_metadata: dict | None = None,
    ) -> list[SimilarClaim]:
        """Search for similar claims."""
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        client = await self._get_client()

        # Build filter if provided
        qdrant_filter = None
        if filter_metadata:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_metadata.items()
            ]
            qdrant_filter = Filter(must=conditions)

        results = await client.search(
            collection_name=self._collection_name,
            query_vector=embedding,
            limit=limit,
            query_filter=qdrant_filter,
        )

        return [
            SimilarClaim(
                claim_id=UUID(hit.id),
                score=hit.score,
                canonical_form=hit.payload.get("canonical_form") if hit.payload else None,
            )
            for hit in results
        ]

    async def delete(self, claim_id: UUID) -> bool:
        """Delete a claim embedding."""
        from qdrant_client.models import PointIdsList

        client = await self._get_client()

        await client.delete(
            collection_name=self._collection_name,
            points_selector=PointIdsList(points=[str(claim_id)]),
        )
        logger.debug("Deleted claim embedding", claim_id=str(claim_id))
        return True

    async def close(self) -> None:
        """Close the Qdrant client."""
        if self._client:
            await self._client.close()
            self._client = None


class PineconeStore(VectorStore):
    """Pinecone vector store implementation for production."""

    def __init__(
        self,
        api_key: str,
        index_name: str = "episteme-claims",
        environment: str = "us-east-1",
        dimension: int = 1024,
    ) -> None:
        """Initialize Pinecone store.

        Args:
            api_key: Pinecone API key
            index_name: Name of the index
            environment: Pinecone environment
            dimension: Embedding dimension
        """
        self._api_key = api_key
        self._index_name = index_name
        self._environment = environment
        self._dimension = dimension
        self._index = None

    async def _get_index(self):
        """Get or create Pinecone index."""
        if self._index is None:
            from pinecone import Pinecone

            pc = Pinecone(api_key=self._api_key)
            self._index = pc.Index(self._index_name)
        return self._index

    async def initialize(self) -> None:
        """Ensure the index exists."""
        from pinecone import Pinecone, ServerlessSpec

        pc = Pinecone(api_key=self._api_key)

        # Check if index exists
        existing_indexes = pc.list_indexes()
        exists = any(idx.name == self._index_name for idx in existing_indexes)

        if not exists:
            pc.create_index(
                name=self._index_name,
                dimension=self._dimension,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region=self._environment),
            )
            logger.info("Created Pinecone index", index=self._index_name)
        else:
            logger.info("Pinecone index exists", index=self._index_name)

    async def upsert(
        self,
        claim_id: UUID,
        embedding: list[float],
        metadata: dict | None = None,
    ) -> None:
        """Insert or update a claim embedding."""
        index = await self._get_index()

        index.upsert(
            vectors=[
                {
                    "id": str(claim_id),
                    "values": embedding,
                    "metadata": metadata or {},
                }
            ]
        )
        logger.debug("Upserted claim embedding", claim_id=str(claim_id))

    async def search(
        self,
        embedding: list[float],
        limit: int = 10,
        filter_metadata: dict | None = None,
    ) -> list[SimilarClaim]:
        """Search for similar claims."""
        index = await self._get_index()

        results = index.query(
            vector=embedding,
            top_k=limit,
            include_metadata=True,
            filter=filter_metadata,
        )

        return [
            SimilarClaim(
                claim_id=UUID(match.id),
                score=match.score,
                canonical_form=match.metadata.get("canonical_form") if match.metadata else None,
            )
            for match in results.matches
        ]

    async def delete(self, claim_id: UUID) -> bool:
        """Delete a claim embedding."""
        index = await self._get_index()
        index.delete(ids=[str(claim_id)])
        logger.debug("Deleted claim embedding", claim_id=str(claim_id))
        return True

    async def close(self) -> None:
        """Close connections (no-op for Pinecone)."""
        self._index = None


class VectorClient:
    """Unified vector client that delegates to the configured store.

    Combines embedding generation with vector storage operations.

    Example:
        ```python
        async with VectorClient() as client:
            await client.upsert_claim(claim_id, "Earth is 4.5 billion years old")
            similar = await client.search_similar("How old is the Earth?", limit=5)
        ```
    """

    def __init__(
        self,
        store: VectorStore | None = None,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        """Initialize the vector client.

        Args:
            store: Vector store (defaults based on config)
            embedding_service: Embedding service (defaults to VoyageEmbeddings)
        """
        settings = get_settings()

        if store is None:
            if settings.vector.provider == "pinecone":
                api_key = settings.vector.pinecone_api_key
                if api_key is None:
                    raise ValueError("Pinecone API key required for pinecone provider")
                store = PineconeStore(
                    api_key=api_key.get_secret_value(),
                    index_name=settings.vector.pinecone_index_name,
                    environment=settings.vector.pinecone_environment,
                )
            else:
                store = QdrantStore(
                    host=settings.vector.qdrant_host,
                    port=settings.vector.qdrant_port,
                    collection_name=settings.vector.qdrant_collection_name,
                )

        self._store = store
        self._embedding_service = embedding_service or EmbeddingService()

    async def initialize(self) -> None:
        """Initialize the vector store."""
        await self._store.initialize()

    async def close(self) -> None:
        """Close all connections."""
        await self._store.close()
        await self._embedding_service.close()

    async def __aenter__(self) -> "VectorClient":
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()

    async def upsert_claim(
        self,
        claim_id: UUID,
        canonical_form: str,
        metadata: dict | None = None,
    ) -> None:
        """Store a claim's embedding.

        Args:
            claim_id: The claim's UUID
            canonical_form: The claim's canonical text
            metadata: Additional metadata to store
        """
        embedding = await self._embedding_service.embed(canonical_form)

        full_metadata = {"canonical_form": canonical_form}
        if metadata:
            full_metadata.update(metadata)

        await self._store.upsert(claim_id, embedding, full_metadata)

    async def search_similar(
        self,
        query: str,
        limit: int = 10,
        filter_metadata: dict | None = None,
    ) -> list[SimilarClaim]:
        """Search for claims similar to a query.

        Args:
            query: Text to search for
            limit: Maximum number of results
            filter_metadata: Optional metadata filters

        Returns:
            List of similar claims with scores
        """
        embedding = await self._embedding_service.embed(query)
        return await self._store.search(embedding, limit, filter_metadata)

    async def delete_claim(self, claim_id: UUID) -> bool:
        """Delete a claim's embedding.

        Args:
            claim_id: The claim's UUID

        Returns:
            True if deleted
        """
        return await self._store.delete(claim_id)

    async def batch_upsert(
        self,
        claims: list[tuple[UUID, str, dict | None]],
    ) -> None:
        """Batch upsert multiple claims.

        Args:
            claims: List of (claim_id, canonical_form, metadata) tuples
        """
        # Generate embeddings in batch
        texts = [c[1] for c in claims]
        embeddings = await self._embedding_service.embed_batch(texts)

        # Upsert each claim
        for (claim_id, canonical_form, metadata), embedding in zip(claims, embeddings):
            full_metadata = {"canonical_form": canonical_form}
            if metadata:
                full_metadata.update(metadata)
            await self._store.upsert(claim_id, embedding, full_metadata)

        logger.info("Batch upserted claims", count=len(claims))
