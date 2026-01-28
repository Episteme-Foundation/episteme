"""Repository pattern implementations for Episteme.

Repositories provide a unified interface for data access, coordinating
across multiple storage backends (Neo4j, Vector DB, PostgreSQL).
"""

from episteme.storage.repositories.claim_repository import ClaimRepository

__all__ = ["ClaimRepository"]
