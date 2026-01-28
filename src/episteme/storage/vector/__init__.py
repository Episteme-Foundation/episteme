"""Vector database integration for semantic claim matching."""

from episteme.storage.vector.client import VectorClient
from episteme.storage.vector.embeddings import EmbeddingService

__all__ = ["VectorClient", "EmbeddingService"]
