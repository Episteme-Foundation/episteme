"""PostgreSQL document store client.

Provides async database connection and session management using SQLAlchemy.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from uuid import UUID

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from episteme.config import get_settings
from episteme.storage.document.models import (
    Base,
    SourceModel,
    InstanceModel,
    AssessmentModel,
    ContributionModel,
    AuditLogModel,
)

logger = structlog.get_logger()


class DocumentClient:
    """Async client for PostgreSQL document store.

    Manages sources, instances, assessments, contributions, and audit logs.

    Example:
        ```python
        async with DocumentClient() as client:
            source = await client.create_source(source_data)
            instances = await client.get_instances_for_claim(claim_id)
        ```
    """

    def __init__(self, database_url: str | None = None) -> None:
        """Initialize the document client.

        Args:
            database_url: PostgreSQL connection URL (defaults to config)
        """
        settings = get_settings()
        self._database_url = database_url or settings.database.postgres_url
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None

    async def connect(self) -> None:
        """Establish database connection and create session factory."""
        if self._engine is None:
            self._engine = create_async_engine(
                self._database_url,
                echo=False,
                pool_size=10,
                max_overflow=20,
            )
            self._session_factory = async_sessionmaker(
                self._engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            logger.info("Connected to PostgreSQL")

    async def close(self) -> None:
        """Close database connection."""
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._session_factory = None
            logger.info("Disconnected from PostgreSQL")

    async def __aenter__(self) -> "DocumentClient":
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get a database session.

        Yields:
            AsyncSession for database operations
        """
        if self._session_factory is None:
            await self.connect()
        assert self._session_factory is not None

        async with self._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def initialize_schema(self) -> None:
        """Create all database tables."""
        if self._engine is None:
            await self.connect()
        assert self._engine is not None

        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("PostgreSQL schema initialized")

    # =========================================================================
    # Source Operations
    # =========================================================================

    async def create_source(self, source: SourceModel) -> UUID:
        """Create a new source.

        Args:
            source: The source to create

        Returns:
            The source's UUID
        """
        async with self.session() as session:
            session.add(source)
            await session.flush()
            logger.info("Created source", source_id=str(source.id))
            return source.id

    async def get_source(self, source_id: UUID) -> SourceModel | None:
        """Get a source by ID.

        Args:
            source_id: The source's UUID

        Returns:
            The source if found, None otherwise
        """
        async with self.session() as session:
            return await session.get(SourceModel, source_id)

    async def get_source_by_url(self, url: str) -> SourceModel | None:
        """Get a source by URL.

        Args:
            url: The source URL

        Returns:
            The source if found, None otherwise
        """
        async with self.session() as session:
            result = await session.execute(
                select(SourceModel).where(SourceModel.url == url)
            )
            return result.scalar_one_or_none()

    async def get_source_by_hash(self, content_hash: str) -> SourceModel | None:
        """Get a source by content hash.

        Args:
            content_hash: SHA-256 hash of content

        Returns:
            The source if found, None otherwise
        """
        async with self.session() as session:
            result = await session.execute(
                select(SourceModel).where(SourceModel.content_hash == content_hash)
            )
            return result.scalar_one_or_none()

    # =========================================================================
    # Instance Operations
    # =========================================================================

    async def create_instance(self, instance: InstanceModel) -> UUID:
        """Create a new instance.

        Args:
            instance: The instance to create

        Returns:
            The instance's UUID
        """
        async with self.session() as session:
            session.add(instance)
            await session.flush()
            logger.info(
                "Created instance",
                instance_id=str(instance.id),
                claim_id=str(instance.claim_id),
            )
            return instance.id

    async def get_instances_for_claim(
        self,
        claim_id: UUID,
        limit: int = 100,
    ) -> list[InstanceModel]:
        """Get all instances of a claim.

        Args:
            claim_id: The claim's UUID
            limit: Maximum number of instances

        Returns:
            List of instances
        """
        async with self.session() as session:
            result = await session.execute(
                select(InstanceModel)
                .where(InstanceModel.claim_id == claim_id)
                .order_by(InstanceModel.created_at.desc())
                .limit(limit)
            )
            return list(result.scalars().all())

    async def get_instances_for_source(self, source_id: UUID) -> list[InstanceModel]:
        """Get all instances from a source.

        Args:
            source_id: The source's UUID

        Returns:
            List of instances
        """
        async with self.session() as session:
            result = await session.execute(
                select(InstanceModel)
                .where(InstanceModel.source_id == source_id)
                .order_by(InstanceModel.created_at)
            )
            return list(result.scalars().all())

    # =========================================================================
    # Assessment Operations
    # =========================================================================

    async def create_assessment(self, assessment: AssessmentModel) -> UUID:
        """Create a new assessment.

        Args:
            assessment: The assessment to create

        Returns:
            The assessment's UUID
        """
        async with self.session() as session:
            # Mark previous current assessment as not current
            await session.execute(
                AssessmentModel.__table__.update()
                .where(AssessmentModel.claim_id == assessment.claim_id)
                .where(AssessmentModel.is_current == True)
                .values(is_current=False)
            )

            session.add(assessment)
            await session.flush()
            logger.info(
                "Created assessment",
                assessment_id=str(assessment.id),
                claim_id=str(assessment.claim_id),
                status=assessment.status,
            )
            return assessment.id

    async def get_current_assessment(self, claim_id: UUID) -> AssessmentModel | None:
        """Get the current assessment for a claim.

        Args:
            claim_id: The claim's UUID

        Returns:
            The current assessment if exists, None otherwise
        """
        async with self.session() as session:
            result = await session.execute(
                select(AssessmentModel)
                .where(AssessmentModel.claim_id == claim_id)
                .where(AssessmentModel.is_current == True)
            )
            return result.scalar_one_or_none()

    async def get_assessment_history(
        self,
        claim_id: UUID,
        limit: int = 10,
    ) -> list[AssessmentModel]:
        """Get assessment history for a claim.

        Args:
            claim_id: The claim's UUID
            limit: Maximum number of assessments

        Returns:
            List of assessments, most recent first
        """
        async with self.session() as session:
            result = await session.execute(
                select(AssessmentModel)
                .where(AssessmentModel.claim_id == claim_id)
                .order_by(AssessmentModel.assessed_at.desc())
                .limit(limit)
            )
            return list(result.scalars().all())

    # =========================================================================
    # Contribution Operations
    # =========================================================================

    async def create_contribution(self, contribution: ContributionModel) -> UUID:
        """Create a new contribution.

        Args:
            contribution: The contribution to create

        Returns:
            The contribution's UUID
        """
        async with self.session() as session:
            session.add(contribution)
            await session.flush()
            logger.info(
                "Created contribution",
                contribution_id=str(contribution.id),
                claim_id=str(contribution.claim_id),
                type=contribution.contribution_type,
            )
            return contribution.id

    async def get_contribution(self, contribution_id: UUID) -> ContributionModel | None:
        """Get a contribution by ID.

        Args:
            contribution_id: The contribution's UUID

        Returns:
            The contribution if found, None otherwise
        """
        async with self.session() as session:
            return await session.get(ContributionModel, contribution_id)

    async def get_pending_contributions(
        self,
        limit: int = 100,
    ) -> list[ContributionModel]:
        """Get pending contributions ordered by submission time.

        Args:
            limit: Maximum number of contributions

        Returns:
            List of pending contributions
        """
        async with self.session() as session:
            result = await session.execute(
                select(ContributionModel)
                .where(ContributionModel.review_status == "pending")
                .order_by(ContributionModel.submitted_at)
                .limit(limit)
            )
            return list(result.scalars().all())

    async def update_contribution_status(
        self,
        contribution_id: UUID,
        status: str,
        review_id: UUID | None = None,
    ) -> bool:
        """Update a contribution's review status.

        Args:
            contribution_id: The contribution's UUID
            status: New status
            review_id: Optional review ID

        Returns:
            True if updated, False if not found
        """
        async with self.session() as session:
            contribution = await session.get(ContributionModel, contribution_id)
            if contribution is None:
                return False
            contribution.review_status = status
            if review_id:
                contribution.review_id = review_id
            logger.info(
                "Updated contribution status",
                contribution_id=str(contribution_id),
                status=status,
            )
            return True

    # =========================================================================
    # Audit Log Operations
    # =========================================================================

    async def log_action(
        self,
        agent: str,
        action: str,
        entity_type: str,
        entity_id: UUID,
        details: dict | None = None,
        reasoning: str | None = None,
        parent_log_id: UUID | None = None,
    ) -> UUID:
        """Log an action to the audit log.

        Args:
            agent: The agent performing the action
            action: The action being performed
            entity_type: Type of entity affected
            entity_id: ID of entity affected
            details: Additional details
            reasoning: Reasoning trace
            parent_log_id: Parent log entry if nested

        Returns:
            The audit log entry's UUID
        """
        log_entry = AuditLogModel(
            agent=agent,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
            reasoning=reasoning,
            parent_log_id=parent_log_id,
        )
        async with self.session() as session:
            session.add(log_entry)
            await session.flush()
            return log_entry.id

    async def get_audit_log(
        self,
        entity_type: str | None = None,
        entity_id: UUID | None = None,
        agent: str | None = None,
        limit: int = 100,
    ) -> list[AuditLogModel]:
        """Query the audit log.

        Args:
            entity_type: Filter by entity type
            entity_id: Filter by entity ID
            agent: Filter by agent
            limit: Maximum number of entries

        Returns:
            List of audit log entries
        """
        async with self.session() as session:
            query = select(AuditLogModel)

            if entity_type:
                query = query.where(AuditLogModel.entity_type == entity_type)
            if entity_id:
                query = query.where(AuditLogModel.entity_id == entity_id)
            if agent:
                query = query.where(AuditLogModel.agent == agent)

            query = query.order_by(AuditLogModel.timestamp.desc()).limit(limit)

            result = await session.execute(query)
            return list(result.scalars().all())

    # =========================================================================
    # Statistics
    # =========================================================================

    async def count_sources(self) -> int:
        """Count total sources."""
        async with self.session() as session:
            result = await session.execute(select(func.count(SourceModel.id)))
            return result.scalar() or 0

    async def count_instances(self) -> int:
        """Count total instances."""
        async with self.session() as session:
            result = await session.execute(select(func.count(InstanceModel.id)))
            return result.scalar() or 0

    async def count_contributions_by_status(self) -> dict[str, int]:
        """Count contributions grouped by status."""
        async with self.session() as session:
            result = await session.execute(
                select(
                    ContributionModel.review_status,
                    func.count(ContributionModel.id),
                ).group_by(ContributionModel.review_status)
            )
            return {row[0]: row[1] for row in result.all()}
