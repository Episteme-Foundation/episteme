"""Decomposer agent for breaking claims into subclaims.

The Decomposer is responsible for building the dependency tree of claims.
It identifies what a claim depends on (subclaims) and connects them to
existing claims in the graph when matches are found.
"""

import time
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, Field

from episteme.llm.agents.base import ProcessingAgent, AgentResult, AgentConfig
from episteme.llm.client import AnthropicClient
from episteme.llm.prompts.decomposer import DecomposerPrompts
from episteme.llm.tools.graph_tools import GraphTools, ToolResult
from episteme.domain.claim import Claim, SubClaim
from episteme.domain.enums import DecompositionRelation
from episteme.storage.repositories.claim_repository import ClaimRepository


class SubClaimResponse(BaseModel):
    """Response model for a single subclaim from decomposition."""

    text: str = Field(
        ...,
        description="The subclaim's canonical form (precise, unambiguous)",
    )
    relation: str = Field(
        ...,
        description="Relationship type: requires, supports, contradicts, specifies, defines, presupposes",
    )
    reasoning: str = Field(
        ...,
        description="Why this is a valid decomposition of the parent",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence in this decomposition",
    )
    existing_claim_id: str | None = Field(
        default=None,
        description="UUID of matching existing claim, if found",
    )
    is_atomic: bool = Field(
        default=False,
        description="Whether this subclaim cannot be further decomposed",
    )
    atomic_type: str | None = Field(
        default=None,
        description="If atomic: bedrock_fact, contested_empirical, or value_premise",
    )


class DecompositionResponse(BaseModel):
    """Response model for claim decomposition."""

    is_atomic: bool = Field(
        ...,
        description="Whether the claim is atomic (cannot be decomposed)",
    )
    atomic_type: str | None = Field(
        default=None,
        description="If atomic: bedrock_fact, contested_empirical, or value_premise",
    )
    subclaims: list[SubClaimResponse] = Field(
        default_factory=list,
        description="List of subclaims if not atomic",
    )
    reasoning_summary: str = Field(
        ...,
        description="Overall explanation of the decomposition",
    )


@dataclass
class DecompositionInput:
    """Input for the Decomposer agent."""

    claim: Claim
    context: str | None = None
    max_depth: int = 5


@dataclass
class DecompositionResult:
    """Result from claim decomposition."""

    is_atomic: bool
    atomic_type: str | None
    subclaims: list[SubClaim]
    reasoning: str


class DecomposerAgent(ProcessingAgent[DecompositionInput, DecompositionResult]):
    """Agent for decomposing claims into subclaims.

    The Decomposer breaks claims down into their constituent parts,
    identifying what each claim depends on. It uses graph tools to
    find existing claims and avoid creating duplicates.

    Example:
        ```python
        agent = DecomposerAgent(repository=claim_repo)

        result = await agent.execute(DecompositionInput(
            claim=claim,
            context="Economic analysis article",
        ))

        if result.output.is_atomic:
            print(f"Atomic claim: {result.output.atomic_type}")
        else:
            for subclaim in result.output.subclaims:
                print(f"- {subclaim.text} ({subclaim.relation})")
        ```
    """

    def __init__(
        self,
        repository: ClaimRepository | None = None,
        client: AnthropicClient | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the Decomposer agent.

        Args:
            repository: Claim repository for graph access (optional for tool use)
            client: Anthropic client
            config: Agent configuration
        """
        super().__init__(client, config)
        self._repository = repository
        self._tools = GraphTools(repository) if repository else None

    def _get_default_model(self) -> str:
        """Decomposer uses the extraction model."""
        return self._settings.llm.extraction_model

    def get_system_prompt(self) -> str:
        """Get the system prompt with constitution."""
        return DecomposerPrompts.get_system_prompt()

    async def execute(
        self,
        input: DecompositionInput,
    ) -> AgentResult[DecompositionResult]:
        """Decompose a claim into subclaims.

        Args:
            input: The claim to decompose with optional context

        Returns:
            AgentResult containing the decomposition
        """
        start_time = time.time()

        # Build the user prompt
        user_prompt = DecomposerPrompts.get_decomposition_prompt(
            canonical_form=input.claim.canonical_form,
            claim_type=input.claim.claim_type.value,
            context=input.context,
        )

        # Execute with tool use if repository is available
        if self._tools:
            result = await self._execute_with_tools(user_prompt, input)
        else:
            result = await self._execute_without_tools(user_prompt, input)

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"Decompose: {input.claim.canonical_form[:50]}...",
            output_summary=f"{'Atomic' if result.is_atomic else f'{len(result.subclaims)} subclaims'}",
            execution_time_ms=execution_time,
            usage=self._client.total_usage,
        )

        return AgentResult(
            output=result,
            reasoning=result.reasoning,
            execution_time_ms=execution_time,
            metadata={
                "claim_id": str(input.claim.id),
                "is_atomic": result.is_atomic,
                "subclaim_count": len(result.subclaims),
            },
        )

    async def _execute_with_tools(
        self,
        user_prompt: str,
        input: DecompositionInput,
    ) -> DecompositionResult:
        """Execute decomposition with tool use for graph queries."""
        assert self._tools is not None

        messages = [{"role": "user", "content": user_prompt}]
        tools = self._tools.get_tool_definitions()

        # Add the structured output tool
        tools.append({
            "name": "submit_decomposition",
            "description": "Submit the final decomposition result",
            "input_schema": DecompositionResponse.model_json_schema(),
        })

        max_iterations = 5
        for _ in range(max_iterations):
            response = await self._client.complete_with_tools(
                messages=messages,
                tools=tools,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )

            # Check if we have a final response
            if response.stop_reason == "end_turn":
                # Try to parse from text response as fallback
                return await self._parse_text_response(response.content, input)

            # Process tool uses
            tool_results = []
            final_result = None

            for tool_use in response.tool_uses:
                if tool_use.name == "submit_decomposition":
                    # This is our structured output - parse and return
                    decomp_response = DecompositionResponse.model_validate(tool_use.input)
                    final_result = self._response_to_result(decomp_response)
                else:
                    # Execute graph tool
                    result = await self._tools.execute_tool(
                        tool_use.name,
                        tool_use.input,
                    )
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use.id,
                        "content": self._format_tool_result(result),
                    })

            if final_result:
                return final_result

            # Continue conversation with tool results
            # Serialize raw content for the assistant message
            assistant_content = []
            for block in response.raw_content:
                if hasattr(block, "text"):
                    assistant_content.append({"type": "text", "text": block.text})
                elif hasattr(block, "type") and block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            messages.append({"role": "assistant", "content": assistant_content})
            messages.append({"role": "user", "content": tool_results})

        # Fallback if max iterations reached
        return DecompositionResult(
            is_atomic=False,
            atomic_type=None,
            subclaims=[],
            reasoning="Max iterations reached during decomposition",
        )

    async def _execute_without_tools(
        self,
        user_prompt: str,
        input: DecompositionInput,
    ) -> DecompositionResult:
        """Execute decomposition without tools (simpler path)."""
        try:
            response = await self._client.complete_structured(
                messages=[{"role": "user", "content": user_prompt}],
                response_model=DecompositionResponse,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
            return self._response_to_result(response)
        except Exception:
            # Fallback to text parsing
            result = await self._client.complete(
                messages=[{"role": "user", "content": user_prompt}],
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
            return await self._parse_text_response(result.content, input)

    def _response_to_result(
        self,
        response: DecompositionResponse,
    ) -> DecompositionResult:
        """Convert API response to domain result."""
        subclaims = []
        for s in response.subclaims:
            relation = self._parse_relation(s.relation)
            subclaims.append(SubClaim(
                text=s.text,
                relation=relation,
                reasoning=s.reasoning,
                confidence=s.confidence,
                existing_claim_id=UUID(s.existing_claim_id) if s.existing_claim_id else None,
            ))

        return DecompositionResult(
            is_atomic=response.is_atomic,
            atomic_type=response.atomic_type,
            subclaims=subclaims,
            reasoning=response.reasoning_summary,
        )

    def _parse_relation(self, relation_str: str) -> DecompositionRelation:
        """Parse relation string to enum."""
        relation_map = {
            "requires": DecompositionRelation.REQUIRES,
            "supports": DecompositionRelation.SUPPORTS,
            "contradicts": DecompositionRelation.CONTRADICTS,
            "specifies": DecompositionRelation.SPECIFIES,
            "defines": DecompositionRelation.DEFINES,
            "presupposes": DecompositionRelation.PRESUPPOSES,
        }
        return relation_map.get(relation_str.lower(), DecompositionRelation.REQUIRES)

    async def _parse_text_response(
        self,
        text: str,
        input: DecompositionInput,
    ) -> DecompositionResult:
        """Parse a text response when structured output fails."""
        import json
        import re

        # Try to find JSON in the response
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                response = DecompositionResponse.model_validate(data)
                return self._response_to_result(response)
            except (json.JSONDecodeError, ValueError):
                pass

        # Check for atomic indicators
        is_atomic = any(
            phrase in text.lower()
            for phrase in ["is atomic", "cannot be decomposed", "bedrock fact", "value premise"]
        )

        return DecompositionResult(
            is_atomic=is_atomic,
            atomic_type=None,
            subclaims=[],
            reasoning=text[:500] if len(text) > 500 else text,
        )

    def _format_tool_result(self, result: ToolResult) -> str:
        """Format tool result for inclusion in messages."""
        import json

        if not result.success:
            return f"Error: {result.error}"
        return json.dumps(result.data, indent=2)

    async def check_atomic(
        self,
        claim: Claim,
    ) -> AgentResult[dict]:
        """Check if a claim is atomic (cannot be further decomposed).

        Args:
            claim: The claim to check

        Returns:
            AgentResult with atomic status and reasoning
        """
        start_time = time.time()

        user_prompt = DecomposerPrompts.get_atomic_check_prompt(claim.canonical_form)

        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        execution_time = (time.time() - start_time) * 1000

        # Parse the response
        text = result.content.lower()
        is_atomic = "is_atomic: true" in text or "is atomic" in text

        atomic_type = None
        if "bedrock_fact" in text or "bedrock fact" in text:
            atomic_type = "bedrock_fact"
        elif "contested_empirical" in text or "contested empirical" in text:
            atomic_type = "contested_empirical"
        elif "value_premise" in text or "value premise" in text:
            atomic_type = "value_premise"

        return AgentResult(
            output={
                "is_atomic": is_atomic,
                "atomic_type": atomic_type,
                "reasoning": result.content,
            },
            reasoning=result.content,
            execution_time_ms=execution_time,
        )

    async def batch_decompose(
        self,
        claims: list[Claim],
    ) -> list[AgentResult[DecompositionResult]]:
        """Decompose multiple claims.

        Args:
            claims: List of claims to decompose

        Returns:
            List of decomposition results
        """
        results = []
        for claim in claims:
            result = await self.execute(DecompositionInput(claim=claim))
            results.append(result)
        return results
