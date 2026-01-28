"""Contributor domain model.

Contributors are users or systems that submit contributions to the knowledge
graph. They have reputation scores based on their contribution history.
"""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Contributor(BaseModel):
    """A contributor to the knowledge graph.

    Contributors have reputation scores that affect how their contributions
    are prioritized and reviewed. Higher reputation means faster review
    and more benefit of the doubt; lower reputation means more scrutiny.

    Reputation formula:
        reputation_score = f(
            accepted_contributions,
            rejected_contributions,
            contribution_quality_over_time,
            audit_results_on_their_contributions,
            age_of_account
        )

    Attributes:
        id: Unique identifier for this contributor
        external_id: External system ID (if authenticated via OAuth, etc.)
        display_name: Display name for public attribution
        email: Email address (optional, for notifications)
        reputation_score: Current reputation score (0-100)
        contributions_accepted: Count of accepted contributions
        contributions_rejected: Count of rejected contributions
        contributions_pending: Count of pending contributions
        contributions_escalated: Count of escalated contributions
        quality_scores: Recent quality scores from audits
        created_at: When this contributor account was created
        last_active_at: When they last submitted a contribution
        is_verified: Whether identity has been verified
        is_suspended: Whether this contributor is suspended
        suspension_reason: Reason for suspension (if suspended)
        metadata: Additional structured data
    """

    id: UUID = Field(default_factory=uuid4)
    external_id: str | None = Field(
        default=None,
        description="External system ID (OAuth, etc.)",
    )
    display_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name for public attribution",
    )
    email: str | None = Field(
        default=None,
        description="Email address for notifications",
    )
    reputation_score: float = Field(
        default=50.0,
        ge=0.0,
        le=100.0,
        description="Current reputation score (0-100)",
    )
    contributions_accepted: int = Field(
        default=0,
        ge=0,
        description="Count of accepted contributions",
    )
    contributions_rejected: int = Field(
        default=0,
        ge=0,
        description="Count of rejected contributions",
    )
    contributions_pending: int = Field(
        default=0,
        ge=0,
        description="Count of pending contributions",
    )
    contributions_escalated: int = Field(
        default=0,
        ge=0,
        description="Count of escalated contributions",
    )
    quality_scores: list[float] = Field(
        default_factory=list,
        description="Recent quality scores from audits (0-1)",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = Field(
        default=False,
        description="Whether identity has been verified",
    )
    is_suspended: bool = Field(
        default=False,
        description="Whether this contributor is suspended",
    )
    suspension_reason: str | None = Field(
        default=None,
        description="Reason for suspension",
    )
    metadata: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        description="Additional structured data",
    )

    def calculate_reputation(self) -> float:
        """Calculate reputation score based on contribution history.

        The formula weights:
        - Acceptance rate (accepted / total)
        - Recent quality scores from audits
        - Account age (more history = more reliable signal)
        - Verification status (bonus for verified accounts)

        Returns:
            Reputation score from 0 to 100
        """
        total_contributions = (
            self.contributions_accepted
            + self.contributions_rejected
            + self.contributions_escalated
        )

        if total_contributions == 0:
            # New contributors start at 50
            base_score = 50.0
        else:
            # Acceptance rate contributes up to 40 points
            acceptance_rate = self.contributions_accepted / total_contributions
            acceptance_score = acceptance_rate * 40

            # Escalation is neutral to slightly positive (shows engagement)
            escalation_rate = self.contributions_escalated / total_contributions
            escalation_score = escalation_rate * 5

            # Base from acceptance
            base_score = 30 + acceptance_score + escalation_score

        # Quality score bonus (up to 20 points)
        if self.quality_scores:
            avg_quality = sum(self.quality_scores[-10:]) / len(self.quality_scores[-10:])
            quality_bonus = avg_quality * 20
        else:
            quality_bonus = 10  # Neutral default

        # Account age bonus (up to 5 points)
        age_days = (datetime.utcnow() - self.created_at).days
        age_bonus = min(age_days / 365, 1.0) * 5

        # Verification bonus
        verification_bonus = 5 if self.is_verified else 0

        # Calculate final score
        score = base_score + quality_bonus + age_bonus + verification_bonus

        # Clamp to 0-100
        return max(0.0, min(100.0, score))

    def update_reputation(self) -> "Contributor":
        """Update the reputation score based on current history.

        Returns:
            Self with updated reputation_score
        """
        self.reputation_score = self.calculate_reputation()
        return self

    def record_contribution_result(
        self,
        accepted: bool,
        escalated: bool = False,
        quality_score: float | None = None,
    ) -> "Contributor":
        """Record the result of a contribution review.

        Args:
            accepted: Whether the contribution was accepted
            escalated: Whether the contribution was escalated
            quality_score: Quality score from audit (if audited)

        Returns:
            Self with updated counters and reputation
        """
        if self.contributions_pending > 0:
            self.contributions_pending -= 1

        if escalated:
            self.contributions_escalated += 1
        elif accepted:
            self.contributions_accepted += 1
        else:
            self.contributions_rejected += 1

        if quality_score is not None:
            self.quality_scores.append(quality_score)
            # Keep only last 100 quality scores
            self.quality_scores = self.quality_scores[-100:]

        self.last_active_at = datetime.utcnow()
        return self.update_reputation()

    def suspend(self, reason: str) -> "Contributor":
        """Suspend this contributor.

        Args:
            reason: Reason for suspension

        Returns:
            Self with is_suspended=True
        """
        self.is_suspended = True
        self.suspension_reason = reason
        return self

    def reinstate(self) -> "Contributor":
        """Reinstate a suspended contributor.

        Returns:
            Self with is_suspended=False
        """
        self.is_suspended = False
        self.suspension_reason = None
        return self

    @property
    def trust_level(self) -> str:
        """Get trust tier based on reputation score.

        Trust levels affect:
        - Review priority (higher trust = faster review)
        - Benefit of doubt (higher trust = more charitable interpretation)
        - Rate limits (higher trust = higher limits)

        Returns:
            One of: banned, probationary, new, standard, trusted, veteran
        """
        if self.is_suspended:
            return "banned"

        total = self.contributions_accepted + self.contributions_rejected
        if total < 5:
            return "new"

        score = self.reputation_score
        if score >= 80:
            return "veteran"
        elif score >= 60:
            return "trusted"
        elif score >= 40:
            return "standard"
        else:
            return "probationary"

    def get_rate_limits(self) -> "ContributorRateLimits":
        """Get rate limits for this contributor's trust level."""
        return ContributorRateLimits.for_trust_level(self.trust_level)


class ContributorRateLimits(BaseModel):
    """Rate limits for a contributor based on trust level.

    Different trust levels have different submission limits
    to prevent abuse while allowing trusted contributors
    to work efficiently.
    """

    contributions_per_hour: int = Field(
        default=10,
        description="Maximum contributions per hour",
    )
    contributions_per_day: int = Field(
        default=50,
        description="Maximum contributions per day",
    )
    appeals_per_day: int = Field(
        default=3,
        description="Maximum appeals per day",
    )

    @classmethod
    def for_trust_level(cls, trust_level: str) -> "ContributorRateLimits":
        """Get rate limits for a trust level."""
        limits = {
            "banned": cls(
                contributions_per_hour=0,
                contributions_per_day=0,
                appeals_per_day=0,
            ),
            "probationary": cls(
                contributions_per_hour=3,
                contributions_per_day=10,
                appeals_per_day=1,
            ),
            "new": cls(
                contributions_per_hour=5,
                contributions_per_day=20,
                appeals_per_day=2,
            ),
            "standard": cls(
                contributions_per_hour=10,
                contributions_per_day=50,
                appeals_per_day=3,
            ),
            "trusted": cls(
                contributions_per_hour=30,
                contributions_per_day=150,
                appeals_per_day=5,
            ),
            "veteran": cls(
                contributions_per_hour=60,
                contributions_per_day=300,
                appeals_per_day=10,
            ),
        }
        return limits.get(trust_level, limits["new"])
