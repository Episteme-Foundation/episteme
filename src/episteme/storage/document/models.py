"""SQLAlchemy models for the PostgreSQL document store.

These models store data that doesn't fit well in the graph database:
- Sources (full document content, metadata)
- Instances (claim occurrences in sources)
- Assessments (validity judgments with reasoning)
- Contributions (community submissions)
- Audit logs (all system decisions)
"""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    type_annotation_map = {
        dict[str, Any]: JSONB,
        list[str]: ARRAY(String),
        list[UUID]: ARRAY(Uuid),
    }


class SourceModel(Base):
    """Source documents from which claims are extracted."""

    __tablename__ = "sources"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="unknown")
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    author: Mapped[str | None] = mapped_column(String(500), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    raw_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    credibility_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    instances: Mapped[list["InstanceModel"]] = relationship(
        "InstanceModel", back_populates="source", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_sources_source_type", "source_type"),
        Index("ix_sources_published_at", "published_at"),
    )


class InstanceModel(Base):
    """Instances of claims within sources."""

    __tablename__ = "instances"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    claim_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    source_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("sources.id"), nullable=False)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    created_by: Mapped[str] = mapped_column(String(100), nullable=False, default="matcher")
    metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    source: Mapped["SourceModel"] = relationship("SourceModel", back_populates="instances")

    __table_args__ = (
        Index("ix_instances_claim_id", "claim_id"),
        Index("ix_instances_created_at", "created_at"),
    )


class AssessmentModel(Base):
    """Claim validity assessments."""

    __tablename__ = "assessments"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    claim_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    reasoning_trace: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_for: Mapped[list[UUID]] = mapped_column(ARRAY(Uuid), nullable=False, default=list)
    evidence_against: Mapped[list[UUID]] = mapped_column(ARRAY(Uuid), nullable=False, default=list)
    assessed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    assessed_by: Mapped[str] = mapped_column(String(100), nullable=False, default="assessor")
    supersedes: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subclaim_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_assessments_claim_id_current", "claim_id", "is_current"),
        Index("ix_assessments_status", "status"),
    )


class ContributionModel(Base):
    """Community contributions (challenges, support, etc.)."""

    __tablename__ = "contributions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    claim_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    contributor_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    contribution_type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_urls: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    review_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    review_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # Optional fields for specific contribution types
    merge_target_claim_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    proposed_canonical_form: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_contributions_review_status", "review_status"),
        Index("ix_contributions_submitted_at", "submitted_at"),
    )


class ContributionReviewModel(Base):
    """Reviews of contributions by the Contribution Reviewer agent."""

    __tablename__ = "contribution_reviews"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    contribution_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contributions.id"), nullable=False, index=True
    )
    decision: Mapped[str] = mapped_column(String(50), nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    policy_citations: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    actions_if_accepted: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_by: Mapped[str] = mapped_column(String(100), nullable=False, default="contribution_reviewer")


class AppealModel(Base):
    """Appeals of contribution rejections."""

    __tablename__ = "appeals"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    contribution_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contributions.id"), nullable=False, index=True
    )
    original_review_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contribution_reviews.id"), nullable=False
    )
    appellant_id: Mapped[str] = mapped_column(String(100), nullable=False)
    appeal_reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    resolution_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")


class ArbitrationResultModel(Base):
    """Results of dispute arbitration."""

    __tablename__ = "arbitration_results"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    contribution_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contributions.id"), nullable=False, index=True
    )
    appeal_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("appeals.id"), nullable=True
    )
    outcome: Mapped[str] = mapped_column(String(50), nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    consensus_achieved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    model_votes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    human_review_recommended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    arbitrated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    arbitrated_by: Mapped[str] = mapped_column(String(100), nullable=False, default="dispute_arbitrator")


class ContributorModel(Base):
    """Contributor accounts with reputation."""

    __tablename__ = "contributors"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reputation_score: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    contributions_accepted: Mapped[int] = mapped_column(nullable=False, default=0)
    contributions_rejected: Mapped[int] = mapped_column(nullable=False, default=0)
    contributions_pending: Mapped[int] = mapped_column(nullable=False, default=0)
    contributions_escalated: Mapped[int] = mapped_column(nullable=False, default=0)
    quality_scores: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    last_active_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    suspension_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_contributors_reputation", "reputation_score"),
        Index("ix_contributors_is_suspended", "is_suspended"),
    )


class AuditLogModel(Base):
    """Audit log for all system decisions and actions."""

    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, index=True
    )
    agent: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_log_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)

    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_timestamp_agent", "timestamp", "agent"),
    )
