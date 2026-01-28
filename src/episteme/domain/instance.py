"""Source and instance domain models.

Sources are documents from which claims are extracted. Instances are specific
occurrences of a claim within a source - the link between a canonical claim
and the original text that expressed it.
"""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl

from episteme.domain.enums import SourceType


class Source(BaseModel):
    """A document or resource from which claims are extracted.

    Sources are classified by type (primary data, peer-reviewed, news, etc.)
    which affects how they're weighted in assessments.

    Attributes:
        id: Unique identifier for this source
        url: URL of the source (if available)
        source_type: Classification by epistemic reliability
        title: Title of the source document
        author: Author or organization
        published_at: When the source was published
        retrieved_at: When we retrieved/ingested the source
        content_hash: Hash of content for deduplication
        raw_content: The full text content (stored separately for large docs)
        metadata: Additional structured data (publication, DOI, etc.)
        credibility_notes: Notes on source reliability
    """

    id: UUID = Field(default_factory=uuid4)
    url: str | None = Field(
        default=None,
        description="URL of the source",
    )
    source_type: SourceType = Field(
        default=SourceType.UNKNOWN,
        description="Classification by epistemic reliability",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Title of the source document",
    )
    author: str | None = Field(
        default=None,
        max_length=500,
        description="Author or organization",
    )
    published_at: datetime | None = Field(
        default=None,
        description="When the source was published",
    )
    retrieved_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When we retrieved/ingested the source",
    )
    content_hash: str | None = Field(
        default=None,
        description="Hash of content for deduplication",
    )
    raw_content: str | None = Field(
        default=None,
        description="The full text content",
    )
    metadata: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        description="Additional structured data (publication, DOI, etc.)",
    )
    credibility_notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Notes on source reliability",
    )


class Instance(BaseModel):
    """A specific occurrence of a claim within a source.

    Instances link canonical claims to the original text that expressed them,
    preserving context and enabling provenance tracking.

    Example:
        Claim: "US CPI inflation exceeded 5% annually in 2022"
        Instance original_text: "inflation soared past 5 percent last year"
        Instance context: "According to the latest BLS data, inflation soared..."

    Attributes:
        id: Unique identifier for this instance
        claim_id: The canonical claim this instance maps to
        source_id: The source document containing this instance
        original_text: The exact text as it appeared in the source
        context: Surrounding text for additional context
        location: Where in the source (URL fragment, page, timestamp, etc.)
        confidence: How confident the matcher is this is the same claim (0-1)
        created_at: When this instance was identified
        created_by: Agent that identified this instance
        metadata: Additional structured data
    """

    id: UUID = Field(default_factory=uuid4)
    claim_id: UUID = Field(
        ...,
        description="The canonical claim this instance maps to",
    )
    source_id: UUID = Field(
        ...,
        description="The source document containing this instance",
    )
    original_text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="The exact text as it appeared in the source",
    )
    context: str | None = Field(
        default=None,
        max_length=10000,
        description="Surrounding text for additional context",
    )
    location: str | None = Field(
        default=None,
        max_length=500,
        description="Where in the source (URL fragment, page, timestamp)",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence this is the same claim (0-1)",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = Field(
        default="matcher",
        description="Agent that identified this instance",
    )
    metadata: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        description="Additional structured data",
    )


class ExtractedClaim(BaseModel):
    """A claim extracted from a document, before matching to canonical form.

    This is the output of the Extractor agent, before the Matcher determines
    if it corresponds to an existing claim or should create a new one.

    Attributes:
        original_text: The exact text from the source
        context: Surrounding text for disambiguation
        proposed_canonical_form: Suggested canonical form
        claim_type: Suggested claim type classification
        confidence: Extractor's confidence this is a valid claim (0-1)
        source_location: Where in the document this was found
    """

    original_text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="The exact text from the source",
    )
    context: str | None = Field(
        default=None,
        max_length=10000,
        description="Surrounding text for disambiguation",
    )
    proposed_canonical_form: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Suggested canonical form",
    )
    claim_type: str = Field(
        default="empirical_derived",
        description="Suggested claim type classification",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence this is a valid claim (0-1)",
    )
    source_location: str | None = Field(
        default=None,
        description="Where in the document this was found",
    )


class MatchResult(BaseModel):
    """Result of matching an extracted claim to the knowledge graph.

    The Matcher agent returns this to indicate whether the claim matches
    an existing canonical form or should be created as new.

    Attributes:
        matched_claim_id: ID of existing claim if matched, None if new
        new_canonical_form: Suggested canonical form if creating new claim
        confidence: Confidence in the match/non-match decision (0-1)
        reasoning: Explanation of the matching decision
        alternative_matches: Other claims that were considered
    """

    matched_claim_id: UUID | None = Field(
        default=None,
        description="ID of existing claim if matched",
    )
    new_canonical_form: str | None = Field(
        default=None,
        description="Suggested canonical form if creating new claim",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence in the match decision (0-1)",
    )
    reasoning: str = Field(
        ...,
        description="Explanation of the matching decision",
    )
    alternative_matches: list[tuple[UUID, float]] = Field(
        default_factory=list,
        description="Other claims considered: (claim_id, similarity_score)",
    )
