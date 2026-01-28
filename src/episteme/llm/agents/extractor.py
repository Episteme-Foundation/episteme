"""Extractor agent for identifying and extracting claims from documents.

The Extractor is the first stage of the claim processing pipeline. It takes
a document and produces a list of extracted claims with their original text,
context, and proposed canonical forms.
"""

import time
from dataclasses import dataclass

from pydantic import BaseModel, Field

from episteme.llm.agents.base import ProcessingAgent, AgentResult, AgentConfig
from episteme.llm.client import AnthropicClient
from episteme.llm.prompts.extractor import ExtractorPrompts
from episteme.domain.instance import ExtractedClaim
from episteme.domain.enums import ClaimType


class ExtractedClaimResponse(BaseModel):
    """Response model for a single extracted claim."""

    original_text: str = Field(
        ...,
        description="The exact text from the document",
    )
    context: str | None = Field(
        default=None,
        description="Surrounding text for disambiguation (1-2 sentences)",
    )
    proposed_canonical_form: str = Field(
        ...,
        description="Precise, unambiguous version with explicit parameters",
    )
    claim_type: str = Field(
        ...,
        description="One of: empirical_verifiable, empirical_derived, definitional, evaluative, causal, normative",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence this is a valid, extractable claim",
    )
    source_location: str | None = Field(
        default=None,
        description="Where in the document this was found",
    )


@dataclass
class ExtractionInput:
    """Input for the Extractor agent."""

    content: str
    source_type: str = "document"
    source_title: str | None = None
    additional_context: str | None = None


class ExtractorAgent(ProcessingAgent[ExtractionInput, list[ExtractedClaim]]):
    """Agent for extracting claims from documents.

    The Extractor identifies all substantive claims in a document and produces
    structured output for each, including the original text, context, and a
    proposed canonical form.

    Example:
        ```python
        agent = ExtractorAgent()

        result = await agent.execute(ExtractionInput(
            content="The Earth is approximately 4.5 billion years old...",
            source_type="article",
        ))

        for claim in result.output:
            print(f"Found claim: {claim.proposed_canonical_form}")
        ```
    """

    def __init__(
        self,
        client: AnthropicClient | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the Extractor agent.

        Args:
            client: Anthropic client
            config: Agent configuration
        """
        super().__init__(client, config)

    def _get_default_model(self) -> str:
        """Extractor uses the extraction model."""
        return self._settings.llm.extraction_model

    def get_system_prompt(self) -> str:
        """Get the system prompt with constitution."""
        return ExtractorPrompts.get_system_prompt()

    async def execute(
        self,
        input: ExtractionInput,
    ) -> AgentResult[list[ExtractedClaim]]:
        """Extract claims from a document.

        Args:
            input: The document content and metadata

        Returns:
            AgentResult containing list of extracted claims
        """
        start_time = time.time()

        # Build the user prompt
        user_prompt = ExtractorPrompts.get_extraction_prompt(
            source_type=input.source_type,
            additional_context=input.additional_context,
        )
        user_prompt += input.content

        # Get structured output
        try:
            extracted = await self._client.complete_structured_list(
                messages=[{"role": "user", "content": user_prompt}],
                item_model=ExtractedClaimResponse,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
        except Exception as e:
            # Fall back to parsing from text if structured output fails
            extracted = await self._extract_fallback(input)

        # Convert to domain model
        claims = [
            ExtractedClaim(
                original_text=e.original_text,
                context=e.context,
                proposed_canonical_form=e.proposed_canonical_form,
                claim_type=e.claim_type,
                confidence=e.confidence,
                source_location=e.source_location,
            )
            for e in extracted
        ]

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"{input.source_type}: {len(input.content)} chars",
            output_summary=f"Extracted {len(claims)} claims",
            execution_time_ms=execution_time,
            usage=self._client.total_usage,
        )

        return AgentResult(
            output=claims,
            reasoning=f"Extracted {len(claims)} claims from {input.source_type}",
            execution_time_ms=execution_time,
            metadata={
                "source_type": input.source_type,
                "source_title": input.source_title,
                "content_length": len(input.content),
            },
        )

    async def _extract_fallback(
        self,
        input: ExtractionInput,
    ) -> list[ExtractedClaimResponse]:
        """Fallback extraction using plain completion.

        Used if structured output fails.
        """
        user_prompt = ExtractorPrompts.get_extraction_prompt(
            source_type=input.source_type,
            additional_context=input.additional_context,
        )
        user_prompt += input.content
        user_prompt += """

Please output your extracted claims in the following JSON format:
```json
[
  {
    "original_text": "exact text from document",
    "context": "surrounding context",
    "proposed_canonical_form": "precise canonical form",
    "claim_type": "empirical_derived",
    "confidence": 0.9
  }
]
```
"""

        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        # Parse JSON from response
        import json
        import re

        # Try to find JSON in the response
        json_match = re.search(r'\[[\s\S]*\]', result.content)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return [ExtractedClaimResponse.model_validate(item) for item in data]
            except (json.JSONDecodeError, ValueError):
                pass

        return []

    async def extract_with_refinement(
        self,
        input: ExtractionInput,
        min_confidence: float = 0.7,
    ) -> AgentResult[list[ExtractedClaim]]:
        """Extract claims with additional refinement pass for low-confidence claims.

        Args:
            input: The document content and metadata
            min_confidence: Minimum confidence threshold

        Returns:
            AgentResult containing refined list of extracted claims
        """
        # First pass
        result = await self.execute(input)

        # Identify low-confidence claims
        low_confidence = [c for c in result.output if c.confidence < min_confidence]
        high_confidence = [c for c in result.output if c.confidence >= min_confidence]

        # Refine low-confidence claims
        refined = []
        for claim in low_confidence:
            refinement_prompt = ExtractorPrompts.get_refinement_prompt(
                original_text=claim.original_text,
                proposed_canonical=claim.proposed_canonical_form,
                issue="Low confidence extraction - please verify this is a valid claim and refine the canonical form if needed.",
            )

            try:
                refined_claim = await self._client.complete_structured(
                    messages=[{"role": "user", "content": refinement_prompt}],
                    response_model=ExtractedClaimResponse,
                    system=self.get_system_prompt(),
                    model=self._config.model,
                )
                # Only keep if confidence improved
                if refined_claim.confidence >= min_confidence:
                    refined.append(ExtractedClaim(
                        original_text=claim.original_text,
                        context=claim.context,
                        proposed_canonical_form=refined_claim.proposed_canonical_form,
                        claim_type=refined_claim.claim_type,
                        confidence=refined_claim.confidence,
                        source_location=claim.source_location,
                    ))
            except Exception:
                # Keep original if refinement fails
                refined.append(claim)

        result.output = high_confidence + refined
        return result
