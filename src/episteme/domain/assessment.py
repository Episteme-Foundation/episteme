"""Assessment domain model.

Assessments represent the validity status of a claim based on its
decomposition tree and the assessments of its subclaims.
"""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from episteme.domain.enums import AssessmentStatus


class Assessment(BaseModel):
    """An assessment of a claim's validity.

    Assessments are computed by the Assessor agent, which traverses the
    claim's decomposition tree bottom-up, aggregating the status of
    subclaims to determine the parent's status.

    Assessment propagation:
    - If all supporting subclaims are VERIFIED → parent is stronger
    - If any required subclaim is CONTESTED → parent inherits CONTESTED
    - If key evidence is UNSUPPORTED → parent may be UNSUPPORTED
    - Confidence decreases as you go up the tree

    Attributes:
        id: Unique identifier for this assessment
        claim_id: The claim being assessed
        status: The validity status (verified, contested, unsupported, unknown)
        confidence: Overall confidence in this assessment (0-1)
        reasoning_trace: Full explanation of how this assessment was reached
        evidence_for: Claim IDs that support this claim
        evidence_against: Claim IDs that contradict this claim
        assessed_at: When this assessment was made
        assessed_by: Agent that performed the assessment
        supersedes: Previous assessment ID if this is an update
        is_current: Whether this is the current assessment for the claim
        subclaim_summary: Summary of subclaim assessments
    """

    id: UUID = Field(default_factory=uuid4)
    claim_id: UUID = Field(
        ...,
        description="The claim being assessed",
    )
    status: AssessmentStatus = Field(
        ...,
        description="The validity status",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Overall confidence in this assessment (0-1)",
    )
    reasoning_trace: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Full explanation of how this assessment was reached",
    )
    evidence_for: list[UUID] = Field(
        default_factory=list,
        description="Claim IDs that support this claim",
    )
    evidence_against: list[UUID] = Field(
        default_factory=list,
        description="Claim IDs that contradict this claim",
    )
    assessed_at: datetime = Field(default_factory=datetime.utcnow)
    assessed_by: str = Field(
        default="assessor",
        description="Agent that performed the assessment",
    )
    supersedes: UUID | None = Field(
        default=None,
        description="Previous assessment ID if this is an update",
    )
    is_current: bool = Field(
        default=True,
        description="Whether this is the current assessment for the claim",
    )
    subclaim_summary: dict[str, int] = Field(
        default_factory=dict,
        description="Count of subclaims by status: {'verified': 3, 'contested': 1, ...}",
    )

    def supersede_with(self, new_assessment: "Assessment") -> "Assessment":
        """Mark this assessment as superseded by a new one.

        Args:
            new_assessment: The new assessment replacing this one

        Returns:
            Self with is_current set to False
        """
        self.is_current = False
        new_assessment.supersedes = self.id
        return self


class AssessmentChange(BaseModel):
    """Record of a change in assessment, used for propagation.

    When a subclaim's assessment changes, this change needs to propagate
    up to parent claims. This model tracks the change for audit purposes.

    Attributes:
        claim_id: The claim whose assessment changed
        previous_status: Status before the change
        new_status: Status after the change
        previous_confidence: Confidence before the change
        new_confidence: Confidence after the change
        trigger: What caused this change (contribution, reassessment, etc.)
        changed_at: When the change occurred
        propagated_to: Parent claim IDs that were re-assessed as a result
    """

    claim_id: UUID = Field(..., description="The claim whose assessment changed")
    previous_status: AssessmentStatus | None = Field(
        default=None,
        description="Status before the change (None if first assessment)",
    )
    new_status: AssessmentStatus = Field(..., description="Status after the change")
    previous_confidence: float | None = Field(
        default=None,
        description="Confidence before the change",
    )
    new_confidence: float = Field(..., description="Confidence after the change")
    trigger: str = Field(
        ...,
        description="What caused this change",
    )
    changed_at: datetime = Field(default_factory=datetime.utcnow)
    propagated_to: list[UUID] = Field(
        default_factory=list,
        description="Parent claim IDs that were re-assessed",
    )
