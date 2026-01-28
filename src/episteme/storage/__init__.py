"""Storage layer for Episteme.

This module provides access to the three data stores:
- Graph (Neo4j): Claim relationships and decomposition trees
- Vector (Pinecone/Qdrant): Semantic search for claim matching
- Document (PostgreSQL): Sources, audit logs, metadata
"""

from episteme.storage.graph.client import Neo4jClient
from episteme.storage.vector.client import VectorClient
from episteme.storage.document.client import DocumentClient

__all__ = [
    "Neo4jClient",
    "VectorClient",
    "DocumentClient",
]
