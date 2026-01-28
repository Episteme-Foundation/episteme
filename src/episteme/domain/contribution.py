"""Contribution and governance domain models.

Contributions are the mechanism by which users and external systems can
challenge, support, or modify claims in the knowledge graph. They follow
a Wikipedia-inspired process: submit → review → accept/reject/escalate.
"""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from episteme.domain.enums import (
    ArbitrationOutcome,
    ContributionType,
    ReviewDecision,
)


class Contribution(BaseModel):
    """A contribution to the knowledge graph.

    Contributions can challenge claims, provide supporting evidence, propose
    merges/splits, or suggest edits to canonical forms.

    Attributes:
        id: Unique identifier for this contribution
        claim_id: The claim this contribution relates to
        contributor_id: Who submitted this contribution
        contribution_type: Type of contribution (challenge, support, etc.)
        content: The actual contribution (argument, evidence, proposed edit)
        evidence_urls: URLs supporting this contribution
        submitted_at: When this was submitted
        review_status: Current status (pending, accepted, rejected, escalated)
        review_id: ID of the review decision if reviewed
        metadata: Additional structured data
    """

    id: UUID = Field(default_factory=uuid4)
    claim_id: UUID = Field(
        ...,
        description="The claim this contribution relates to",
    )
    contributor_id: str = Field(
        ...,
        description="Who submitted this contribution",
    )
    contribution_type: ContributionType = Field(
        ...,
        description="Type of contribution",
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="The actual contribution (argument, evidence, proposed edit)",
    )
    evidence_urls: list[str] = Field(
        default_factory=list,
        description="URLs supporting this contribution",
    )
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    review_status: str = Field(
        default="pending",
        description="Current status: pending, accepted, rejected, escalated",
    )
    review_id: UUID | None = Field(
        default=None,
        description="ID of the review decision if reviewed",
    )
    metadata: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        description="Additional structured data",
    )

    # For propose_merge: the other claim to merge with
    merge_target_claim_id: UUID | None = Field(
        default=None,
        description="For PROPOSE_MERGE: the claim to merge into",
    )

    # For propose_edit: the proposed new canonical form
    proposed_canonical_form: str | None = Field(
        default=None,
        max_length=2000,
        description="For PROPOSE_EDIT: the proposed new canonical form",
    )


class ContributionReview(BaseModel):
    """Review of a contribution by the Contribution Reviewer agent.

    Every contribution goes through review, which results in accept,
    reject, or escalate to the Dispute Arbitrator.

    Attributes:
        id: Unique identifier for this review
        contribution_id: The contribution being reviewed
        decision: Accept, reject, or escalate
        reasoning: Full explanation of the decision
        confidence: Reviewer's confidence in this decision (0-1)
        policy_citations: Which policies were applied
        actions_if_accepted: What changes to make if accepted
        reviewed_at: When the review was completed
        reviewed_by: Agent that performed the review
    """

    id: UUID = Field(default_factory=uuid4)
    contribution_id: UUID = Field(
        ...,
        description="The contribution being reviewed",
    )
    decision: ReviewDecision = Field(
        ...,
        description="Accept, reject, or escalate",
    )
    reasoning: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Full explanation of the decision",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Reviewer's confidence in this decision (0-1)",
    )
    policy_citations: list[str] = Field(
        default_factory=list,
        description="Which policies were applied",
    )
    actions_if_accepted: list[str] = Field(
        default_factory=list,
        description="What changes to make if accepted",
    )
    reviewed_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_by: str = Field(
        default="contribution_reviewer",
        description="Agent that performed the review",
    )


class Appeal(BaseModel):
    """An appeal of a contribution rejection.

    Contributors can appeal rejected contributions, which triggers
    escalation to the Dispute Arbitrator.

    Attributes:
        id: Unique identifier for this appeal
        contribution_id: The contribution being appealed
        original_review_id: The review decision being appealed
        appellant_id: Who filed the appeal
        appeal_reasoning: Why the original decision should be reconsidered
        submitted_at: When the appeal was submitted
        resolution_id: ID of the arbitration result if resolved
        status: Current status (pending, resolved)
    """

    id: UUID = Field(default_factory=uuid4)
    contribution_id: UUID = Field(
        ...,
        description="The contribution being appealed",
    )
    original_review_id: UUID = Field(
        ...,
        description="The review decision being appealed",
    )
    appellant_id: str = Field(
        ...,
        description="Who filed the appeal",
    )
    appeal_reasoning: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Why the original decision should be reconsidered",
    )
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    resolution_id: UUID | None = Field(
        default=None,
        description="ID of the arbitration result if resolved",
    )
    status: str = Field(
        default="pending",
        description="Current status: pending, resolved",
    )


class ArbitrationResult(BaseModel):
    """Result of dispute arbitration.

    The Dispute Arbitrator handles escalated reviews and appeals,
    potentially using multi-model consensus for important decisions.

    Attributes:
        id: Unique identifier for this arbitration
        contribution_id: The contribution being arbitrated
        appeal_id: The appeal being resolved (if applicable)
        outcome: Resolved, mark_contested, or human_review
        decision: The specific decision made
        reasoning: Full explanation of the arbitration
        consensus_achieved: Whether multi-model consensus was reached
        model_votes: How each model voted (if multi-model)
        human_review_recommended: Whether this should go to human review
        arbitrated_at: When the arbitration was completed
        arbitrated_by: Agent(s) that performed the arbitration
    """

    id: UUID = Field(default_factory=uuid4)
    contribution_id: UUID = Field(
        ...,
        description="The contribution being arbitrated",
    )
    appeal_id: UUID | None = Field(
        default=None,
        description="The appeal being resolved (if applicable)",
    )
    outcome: ArbitrationOutcome = Field(
        ...,
        description="Resolved, mark_contested, or human_review",
    )
    decision: str = Field(
        ...,
        description="The specific decision made",
    )
    reasoning: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Full explanation of the arbitration",
    )
    consensus_achieved: bool = Field(
        default=True,
        description="Whether multi-model consensus was reached",
    )
    model_votes: dict[str, str] = Field(
        default_factory=dict,
        description="How each model voted: {'claude-opus': 'accept', 'claude-sonnet': 'accept'}",
    )
    human_review_recommended: bool = Field(
        default=False,
        description="Whether this should go to human review",
    )
    arbitrated_at: datetime = Field(default_factory=datetime.utcnow)
    arbitrated_by: str = Field(
        default="dispute_arbitrator",
        description="Agent(s) that performed the arbitration",
    )
