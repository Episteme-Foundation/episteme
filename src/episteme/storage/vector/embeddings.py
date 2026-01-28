"""Embedding generation service.

Uses Anthropic's embedding capabilities or a dedicated embedding model
to convert claim text into vector representations for semantic search.
"""

from typing import Protocol
import hashlib

import structlog
import httpx

from episteme.config import get_settings

logger = structlog.get_logger()


class EmbeddingProvider(Protocol):
    """Protocol for embedding providers."""

    async def embed(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        ...

    @property
    def dimension(self) -> int:
        """Return the embedding dimension."""
        ...


class VoyageEmbeddings:
    """Embedding service using Voyage AI (recommended for retrieval).

    Voyage AI provides state-of-the-art embeddings optimized for retrieval.
    If Voyage API key is not available, falls back to a simple hash-based
    embedding for development.
    """

    DIMENSION = 1024  # voyage-large-2 dimension

    def __init__(self, api_key: str | None = None) -> None:
        """Initialize the Voyage embedding service.

        Args:
            api_key: Voyage AI API key (optional, uses env var if not provided)
        """
        self._api_key = api_key
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url="https://api.voyageai.com/v1",
                headers={"Authorization": f"Bearer {self._api_key}"} if self._api_key else {},
                timeout=30.0,
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def embed(self, text: str) -> list[float]:
        """Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        embeddings = await self.embed_batch([text])
        return embeddings[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if not self._api_key:
            # Fallback to hash-based embeddings for development
            logger.warning("No Voyage API key, using hash-based embeddings")
            return [self._hash_embed(text) for text in texts]

        client = await self._get_client()
        response = await client.post(
            "/embeddings",
            json={
                "model": "voyage-large-2",
                "input": texts,
                "input_type": "document",
            },
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]

    @property
    def dimension(self) -> int:
        """Return the embedding dimension."""
        return self.DIMENSION

    def _hash_embed(self, text: str) -> list[float]:
        """Create a deterministic hash-based embedding for development.

        This is NOT suitable for production - it's just for testing
        without an API key.
        """
        # Create a deterministic hash
        hash_bytes = hashlib.sha256(text.encode()).digest()
        # Extend to full dimension by repeated hashing
        extended = hash_bytes
        while len(extended) < self.DIMENSION * 4:
            extended += hashlib.sha256(extended).digest()
        # Convert to floats in [-1, 1]
        floats = []
        for i in range(self.DIMENSION):
            byte_val = extended[i * 4 : (i + 1) * 4]
            int_val = int.from_bytes(byte_val, "big", signed=True)
            floats.append(int_val / (2**31))
        return floats


class EmbeddingService:
    """Main embedding service that delegates to the configured provider.

    Provides caching and batching optimizations.
    """

    def __init__(self, provider: EmbeddingProvider | None = None) -> None:
        """Initialize the embedding service.

        Args:
            provider: Embedding provider (defaults to VoyageEmbeddings)
        """
        self._provider = provider or VoyageEmbeddings()
        self._cache: dict[str, list[float]] = {}

    async def embed(self, text: str, use_cache: bool = True) -> list[float]:
        """Generate embedding for text.

        Args:
            text: Text to embed
            use_cache: Whether to use cached embeddings

        Returns:
            Embedding vector
        """
        if use_cache and text in self._cache:
            return self._cache[text]

        embedding = await self._provider.embed(text)

        if use_cache:
            self._cache[text] = embedding

        return embedding

    async def embed_batch(
        self,
        texts: list[str],
        use_cache: bool = True,
    ) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed
            use_cache: Whether to use cached embeddings

        Returns:
            List of embedding vectors
        """
        if use_cache:
            # Check cache for each text
            results: list[list[float] | None] = []
            uncached_indices: list[int] = []
            uncached_texts: list[str] = []

            for i, text in enumerate(texts):
                if text in self._cache:
                    results.append(self._cache[text])
                else:
                    results.append(None)
                    uncached_indices.append(i)
                    uncached_texts.append(text)

            # Fetch uncached embeddings
            if uncached_texts:
                new_embeddings = await self._provider.embed_batch(uncached_texts)
                for i, embedding in zip(uncached_indices, new_embeddings):
                    results[i] = embedding
                    self._cache[texts[i]] = embedding

            return [r for r in results if r is not None]
        else:
            return await self._provider.embed_batch(texts)

    @property
    def dimension(self) -> int:
        """Return the embedding dimension."""
        return self._provider.dimension

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._cache.clear()

    async def close(self) -> None:
        """Close the underlying provider."""
        if hasattr(self._provider, "close"):
            await self._provider.close()
