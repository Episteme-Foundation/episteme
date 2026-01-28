"""Claim and decomposition domain models.

Claims are the core primitive of the Episteme system. A claim is a proposition
that can be true or false. Two formulations are the same claim if they decompose
identically into the same subclaims.
"""

from datetime import datetime
from typing import Self
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from episteme.domain.enums import ClaimState, ClaimType, DecompositionRelation


class Claim(BaseModel):
    """A claim is an atomic proposition that can be true or false.

    Claims are identified by their canonical form - a precise, unambiguous
    statement with all implicit parameters made explicit.

    Example:
        Original: "Inflation was high in 2022"
        Canonical: "US CPI inflation exceeded 5% annually in calendar year 2022"

    Attributes:
        id: Unique identifier for this claim
        canonical_form: The precise, unambiguous statement of the claim
        claim_type: Classification by validation method (empirical, normative, etc.)
        state: Lifecycle state (active, contested, merged, etc.)
        merged_into: If merged, the ID of the claim this was merged into
        created_at: When this claim was first created
        updated_at: When this claim was last modified
        created_by: Agent or user that created this claim ("system" for extraction)
        alternative_forms: Other phrasings that map to this canonical form
        metadata: Additional structured data about the claim
    """

    id: UUID = Field(default_factory=uuid4)
    canonical_form: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The precise, unambiguous statement of the claim",
    )
    claim_type: ClaimType = Field(
        default=ClaimType.EMPIRICAL_DERIVED,
        description="Classification of the claim by validation method",
    )
    state: ClaimState = Field(
        default=ClaimState.CREATED,
        description="Lifecycle state of the claim",
    )
    merged_into: UUID | None = Field(
        default=None,
        description="If merged, the ID of the claim this was merged into",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = Field(
        default="system",
        description="Agent or contributor ID that created this claim",
    )
    alternative_forms: list[str] = Field(
        default_factory=list,
        description="Other phrasings that map to this canonical form",
    )
    metadata: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        description="Additional structured data",
    )

    def merge_into(self, target_id: UUID) -> Self:
        """Mark this claim as merged into another claim.

        Args:
            target_id: The ID of the claim to merge into

        Returns:
            Self with updated state and merged_into fields
        """
        self.state = ClaimState.MERGED
        self.merged_into = target_id
        self.updated_at = datetime.utcnow()
        return self

    def mark_contested(self) -> Self:
        """Mark this claim as contested.

        Returns:
            Self with state set to CONTESTED
        """
        self.state = ClaimState.CONTESTED
        self.updated_at = datetime.utcnow()
        return self

    def mark_under_review(self) -> Self:
        """Mark this claim as under review.

        Returns:
            Self with state set to UNDER_REVIEW
        """
        self.state = ClaimState.UNDER_REVIEW
        self.updated_at = datetime.utcnow()
        return self

    def activate(self) -> Self:
        """Mark this claim as active.

        Returns:
            Self with state set to ACTIVE
        """
        self.state = ClaimState.ACTIVE
        self.updated_at = datetime.utcnow()
        return self

    def deprecate(self) -> Self:
        """Mark this claim as deprecated.

        Returns:
            Self with state set to DEPRECATED
        """
        self.state = ClaimState.DEPRECATED
        self.updated_at = datetime.utcnow()
        return self


class Decomposition(BaseModel):
    """A relationship between a parent claim and a subclaim.

    Decomposition edges form a directed acyclic graph (DAG) where claims
    are nodes and decomposition relationships are edges. Every claim
    decomposes into subclaims until hitting "bedrock" - claims that are
    either verified facts, contested empirical questions, or fundamental
    value premises.

    Attributes:
        id: Unique identifier for this decomposition edge
        parent_claim_id: The claim being decomposed
        child_claim_id: The subclaim
        relation: Type of relationship (requires, supports, contradicts, etc.)
        reasoning: Explanation of why this decomposition relationship exists
        confidence: How confident the decomposer is in this relationship (0-1)
        created_at: When this decomposition was created
        created_by: Agent that created this decomposition
    """

    id: UUID = Field(default_factory=uuid4)
    parent_claim_id: UUID = Field(
        ...,
        description="The claim being decomposed",
    )
    child_claim_id: UUID = Field(
        ...,
        description="The subclaim",
    )
    relation: DecompositionRelation = Field(
        ...,
        description="Type of relationship between parent and child",
    )
    reasoning: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Explanation of why this decomposition relationship exists",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence in this decomposition (0-1)",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = Field(
        default="decomposer",
        description="Agent that created this decomposition",
    )


class SubClaim(BaseModel):
    """A subclaim with its relationship to a parent, used in decomposition results.

    This is a convenience model for representing subclaims during decomposition,
    before they've been matched to existing claims or assigned IDs.

    Attributes:
        text: The text of the subclaim (may become canonical form or match existing)
        relation: Relationship to the parent claim
        reasoning: Why this is a subclaim of the parent
        confidence: Confidence in this subclaim identification
        existing_claim_id: If matched to existing claim, its ID
    """

    text: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The text of the subclaim",
    )
    relation: DecompositionRelation = Field(
        ...,
        description="Relationship to the parent claim",
    )
    reasoning: str = Field(
        ...,
        description="Why this is a subclaim of the parent",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence in this subclaim identification",
    )
    existing_claim_id: UUID | None = Field(
        default=None,
        description="If matched to existing claim, its ID",
    )
    is_atomic: bool = Field(
        default=False,
        description="Whether this subclaim cannot be further decomposed",
    )
    atomic_type: str | None = Field(
        default=None,
        description="If atomic: bedrock_fact, contested_empirical, or value_premise",
    )


class ClaimTree(BaseModel):
    """A claim with its full decomposition tree.

    This represents a claim and all its subclaims recursively, used for
    displaying decomposition trees and for assessment.

    Attributes:
        claim: The root claim
        children: List of (child_tree, decomposition) pairs
        depth: Depth of this node in the tree (root = 0)
        is_leaf: Whether this is a leaf node (no further decomposition)
    """

    claim: Claim
    children: list[tuple["ClaimTree", Decomposition]] = Field(default_factory=list)
    depth: int = Field(default=0, ge=0)
    is_leaf: bool = Field(default=True)

    def get_all_claims(self) -> list[Claim]:
        """Get all claims in this tree, flattened.

        Returns:
            List of all claims in the tree, including this one
        """
        claims = [self.claim]
        for child_tree, _ in self.children:
            claims.extend(child_tree.get_all_claims())
        return claims

    def get_leaf_claims(self) -> list[Claim]:
        """Get all leaf claims in this tree.

        Returns:
            List of claims with no children (bedrock claims)
        """
        if self.is_leaf:
            return [self.claim]
        leaves: list[Claim] = []
        for child_tree, _ in self.children:
            leaves.extend(child_tree.get_leaf_claims())
        return leaves

    def max_depth(self) -> int:
        """Get the maximum depth of this tree.

        Returns:
            Maximum depth (0 for leaf, 1+ for trees with children)
        """
        if self.is_leaf:
            return self.depth
        return max(child_tree.max_depth() for child_tree, _ in self.children)
