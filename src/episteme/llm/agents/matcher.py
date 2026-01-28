"""Matcher agent for determining claim identity.

The Matcher determines whether an extracted claim matches an existing
canonical form in the knowledge graph or should be created as a new claim.
"""

import time
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, Field

from episteme.llm.agents.base import ProcessingAgent, AgentResult, AgentConfig
from episteme.llm.client import AnthropicClient
from episteme.llm.prompts.matcher import MatcherPrompts
from episteme.domain.instance import ExtractedClaim, MatchResult
from episteme.storage.vector.client import SimilarClaim


class MatchDecisionResponse(BaseModel):
    """Response model for a matching decision."""

    is_match: bool = Field(
        ...,
        description="Whether the claim matches an existing claim",
    )
    matched_claim_id: str | None = Field(
        default=None,
        description="ID of the matched claim if is_match is True",
    )
    new_canonical_form: str | None = Field(
        default=None,
        description="Proposed canonical form if is_match is False",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence in the matching decision",
    )
    reasoning: str = Field(
        ...,
        description="Detailed explanation of the decision",
    )
    alternative_matches: list[str] = Field(
        default_factory=list,
        description="IDs of other claims that were considered",
    )
    relationship_notes: str | None = Field(
        default=None,
        description="Notes on relationships to other claims (specifications, etc.)",
    )


@dataclass
class MatchingInput:
    """Input for the Matcher agent."""

    extracted_claim: ExtractedClaim
    candidates: list[SimilarClaim]


class MatcherAgent(ProcessingAgent[MatchingInput, MatchResult]):
    """Agent for matching extracted claims to existing canonical forms.

    The Matcher examines an extracted claim against candidates from vector
    search and determines whether it represents an existing claim or should
    be created as new.

    Example:
        ```python
        agent = MatcherAgent()

        # Get candidates from vector search
        candidates = await vector_client.search_similar(
            extracted_claim.proposed_canonical_form
        )

        result = await agent.execute(MatchingInput(
            extracted_claim=extracted_claim,
            candidates=candidates,
        ))

        if result.output.matched_claim_id:
            print(f"Matched to: {result.output.matched_claim_id}")
        else:
            print(f"New claim: {result.output.new_canonical_form}")
        ```
    """

    def __init__(
        self,
        client: AnthropicClient | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the Matcher agent.

        Args:
            client: Anthropic client
            config: Agent configuration
        """
        super().__init__(client, config)

    def _get_default_model(self) -> str:
        """Matcher uses the matching model."""
        return self._settings.llm.matching_model

    def get_system_prompt(self) -> str:
        """Get the system prompt with constitution."""
        return MatcherPrompts.get_system_prompt()

    async def execute(
        self,
        input: MatchingInput,
    ) -> AgentResult[MatchResult]:
        """Determine if a claim matches an existing canonical form.

        Args:
            input: The extracted claim and candidate matches

        Returns:
            AgentResult containing the match decision
        """
        start_time = time.time()

        # Format candidates for prompt
        candidate_dicts = [
            {
                "id": str(c.claim_id),
                "canonical_form": c.canonical_form or "",
                "score": c.score,
            }
            for c in input.candidates
        ]

        # Build user prompt
        user_prompt = MatcherPrompts.get_matching_prompt(
            extracted_text=input.extracted_claim.original_text,
            proposed_canonical=input.extracted_claim.proposed_canonical_form,
            candidates=candidate_dicts,
        )

        # Get structured decision
        try:
            decision = await self._client.complete_structured(
                messages=[{"role": "user", "content": user_prompt}],
                response_model=MatchDecisionResponse,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
        except Exception:
            # Fall back to creating new claim
            decision = MatchDecisionResponse(
                is_match=False,
                new_canonical_form=input.extracted_claim.proposed_canonical_form,
                confidence=0.5,
                reasoning="Structured output failed; defaulting to new claim",
            )

        # Convert to domain model
        match_result = MatchResult(
            matched_claim_id=UUID(decision.matched_claim_id) if decision.matched_claim_id else None,
            new_canonical_form=decision.new_canonical_form,
            confidence=decision.confidence,
            reasoning=decision.reasoning,
            alternative_matches=[
                (UUID(aid), 0.0) for aid in decision.alternative_matches
            ],
        )

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"Matching: {input.extracted_claim.original_text[:50]}...",
            output_summary=f"{'Matched' if match_result.matched_claim_id else 'New'}: {decision.confidence:.2f}",
            execution_time_ms=execution_time,
            usage=self._client.total_usage,
        )

        return AgentResult(
            output=match_result,
            reasoning=decision.reasoning,
            execution_time_ms=execution_time,
            metadata={
                "candidate_count": len(input.candidates),
                "is_match": decision.is_match,
                "relationship_notes": decision.relationship_notes,
            },
        )

    async def evaluate_merge(
        self,
        claim_a_id: UUID,
        claim_a_canonical: str,
        claim_b_id: UUID,
        claim_b_canonical: str,
    ) -> AgentResult[dict]:
        """Evaluate whether two claims should be merged.

        Args:
            claim_a_id: First claim ID
            claim_a_canonical: First claim's canonical form
            claim_b_id: Second claim ID
            claim_b_canonical: Second claim's canonical form

        Returns:
            AgentResult with merge evaluation
        """
        start_time = time.time()

        user_prompt = MatcherPrompts.get_merge_evaluation_prompt(
            claim_a={"id": str(claim_a_id), "canonical_form": claim_a_canonical},
            claim_b={"id": str(claim_b_id), "canonical_form": claim_b_canonical},
        )

        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        execution_time = (time.time() - start_time) * 1000

        # Parse the response (simplified - could use structured output)
        should_merge = "should be merged" in result.content.lower() and "should not be merged" not in result.content.lower()

        return AgentResult(
            output={
                "should_merge": should_merge,
                "reasoning": result.content,
                "claim_a_id": str(claim_a_id),
                "claim_b_id": str(claim_b_id),
            },
            reasoning=result.content,
            execution_time_ms=execution_time,
        )

    async def batch_match(
        self,
        claims: list[MatchingInput],
    ) -> list[AgentResult[MatchResult]]:
        """Match multiple claims.

        Args:
            claims: List of matching inputs

        Returns:
            List of match results
        """
        results = []
        for claim in claims:
            result = await self.execute(claim)
            results.append(result)
        return results
