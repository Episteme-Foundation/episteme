"""Enumeration types for the Episteme domain model."""

from enum import Enum, auto


class ClaimState(str, Enum):
    """Lifecycle state of a claim in the system.

    States:
        CREATED: Just extracted, not yet fully processed
        ACTIVE: Normal state, assessment is current
        UNDER_REVIEW: Disputed, being re-evaluated
        CONTESTED: Genuine disagreement exists, documented with positions
        MERGED: Deduplicated into another claim
        DEPRECATED: Superseded or shown to be incoherent
    """

    CREATED = "created"
    ACTIVE = "active"
    UNDER_REVIEW = "under_review"
    CONTESTED = "contested"
    MERGED = "merged"
    DEPRECATED = "deprecated"


class ClaimType(str, Enum):
    """Classification of claims by their validation method.

    Types:
        EMPIRICAL_VERIFIABLE: Checkable against primary sources
            Example: "BLS reported CPI of 6.5% for 2022"

        EMPIRICAL_DERIVED: Depends on verifiable claims plus meta-claims
            Example: "US CPI inflation in 2022 was 6.5%"

        DEFINITIONAL: Contestable with reference to norms/conventions
            Example: "2% is a normal rate of inflation"

        EVALUATIVE: Composite of empirical + definitional
            Example: "Inflation was high in 2022"

        CAUSAL: Depends on empirical claims plus contested causal models
            Example: "The stimulus caused inflation"

        NORMATIVE: Depends on causal claims plus value judgments
            Example: "The Fed should have raised rates sooner"
    """

    EMPIRICAL_VERIFIABLE = "empirical_verifiable"
    EMPIRICAL_DERIVED = "empirical_derived"
    DEFINITIONAL = "definitional"
    EVALUATIVE = "evaluative"
    CAUSAL = "causal"
    NORMATIVE = "normative"


class AssessmentStatus(str, Enum):
    """Validity status of a claim based on its decomposition tree.

    Statuses:
        VERIFIED: All supporting subclaims are verified, no credible challenges
        CONTESTED: Genuine disagreement exists, multiple positions documented
        UNSUPPORTED: Lacks sufficient evidence or supporting decomposition
        UNKNOWN: Not yet assessed or insufficient information to assess
    """

    VERIFIED = "verified"
    CONTESTED = "contested"
    UNSUPPORTED = "unsupported"
    UNKNOWN = "unknown"


class DecompositionRelation(str, Enum):
    """Type of relationship between a parent claim and its subclaim.

    Relations:
        REQUIRES: Parent requires this subclaim to be true
            Example: "Economy is good" REQUIRES "GDP is growing"

        SUPPORTS: Subclaim provides evidence for parent (but not required)
            Example: "Vaccine is safe" SUPPORTS "No serious adverse events in trials"

        CONTRADICTS: Subclaim, if true, would contradict parent
            Example: "Earth is flat" CONTRADICTS "Ships disappear hull-first"

        SPECIFIES: Subclaim is a more specific version of parent
            Example: "Inflation was high" SPECIFIES "CPI exceeded 5%"

        DEFINES: Subclaim defines a term used in parent
            Example: "High inflation" DEFINES "inflation > 4%"

        PRESUPPOSES: Parent assumes this subclaim without argument
            Example: "We should reduce carbon" PRESUPPOSES "Climate change is real"
    """

    REQUIRES = "requires"
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"
    SPECIFIES = "specifies"
    DEFINES = "defines"
    PRESUPPOSES = "presupposes"


class SourceType(str, Enum):
    """Classification of sources by their epistemic reliability.

    Ordered roughly by reliability (primary > peer-reviewed > secondary > tertiary).

    Types:
        PRIMARY_DATA: Raw data, official statistics, original measurements
        PEER_REVIEWED: Academic papers that passed peer review
        GOVERNMENT: Official government statements and reports
        NEWS_ORIGINAL: Original reporting by journalists
        NEWS_SECONDARY: News articles citing other sources
        OPINION: Editorials, op-eds, analysis pieces
        SOCIAL_MEDIA: Posts on social platforms
        UNKNOWN: Source type could not be determined
    """

    PRIMARY_DATA = "primary_data"
    PEER_REVIEWED = "peer_reviewed"
    GOVERNMENT = "government"
    NEWS_ORIGINAL = "news_original"
    NEWS_SECONDARY = "news_secondary"
    OPINION = "opinion"
    SOCIAL_MEDIA = "social_media"
    UNKNOWN = "unknown"


class ContributionType(str, Enum):
    """Types of contributions that can be submitted to the system.

    Types:
        CHALLENGE: Dispute claim validity or decomposition
            Requires: counter-evidence or logical argument

        SUPPORT: Add evidence supporting a claim
            Requires: verifiable and relevant evidence

        PROPOSE_MERGE: Assert two claims are actually the same
            Requires: demonstrate identical decomposition trees

        PROPOSE_SPLIT: Assert claim conflates distinct assertions
            Requires: show different decomposition paths

        PROPOSE_EDIT: Improve canonical form wording
            Requires: preserve meaning while improving clarity

        ADD_INSTANCE: Link new source to existing claim
            Requires: source must actually make the claim
    """

    CHALLENGE = "challenge"
    SUPPORT = "support"
    PROPOSE_MERGE = "propose_merge"
    PROPOSE_SPLIT = "propose_split"
    PROPOSE_EDIT = "propose_edit"
    ADD_INSTANCE = "add_instance"


class ReviewDecision(str, Enum):
    """Decision made by the Contribution Reviewer agent.

    Decisions:
        ACCEPT: Contribution meets policies, will be implemented
        REJECT: Contribution does not meet policies, with reasoning
        ESCALATE: Unclear or high-stakes, send to Dispute Arbitrator
    """

    ACCEPT = "accept"
    REJECT = "reject"
    ESCALATE = "escalate"


class ArbitrationOutcome(str, Enum):
    """Outcome of dispute arbitration.

    Outcomes:
        RESOLVED: Decision reached, implemented
        MARK_CONTESTED: No consensus, claim marked as contested with positions
        HUMAN_REVIEW: Flagged for human oversight
    """

    RESOLVED = "resolved"
    MARK_CONTESTED = "mark_contested"
    HUMAN_REVIEW = "human_review"
