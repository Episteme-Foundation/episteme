"""Base agent class for Episteme LLM agents.

All agents inherit from BaseAgent, which provides:
- Anthropic client integration
- Constitution-aware prompt building
- Logging and metrics
- Error handling
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Generic, TypeVar

import structlog

from episteme.llm.client import AnthropicClient, TokenUsage
from episteme.config import get_settings

logger = structlog.get_logger()

TInput = TypeVar("TInput")
TOutput = TypeVar("TOutput")


@dataclass
class AgentConfig:
    """Configuration for an agent."""

    model: str | None = None  # Defaults to config
    max_tokens: int = 4096
    temperature: float = 0.0
    include_constitution: bool = True


@dataclass
class AgentResult(Generic[TOutput]):
    """Result from an agent execution."""

    output: TOutput
    reasoning: str | None = None
    usage: TokenUsage | None = None
    execution_time_ms: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseAgent(ABC, Generic[TInput, TOutput]):
    """Abstract base class for Episteme agents.

    All agents follow the same lifecycle:
    1. Receive input
    2. Build prompt (with constitution for admin agents)
    3. Call LLM
    4. Parse response
    5. Return structured output

    Example:
        ```python
        class MyAgent(BaseAgent[MyInput, MyOutput]):
            def get_system_prompt(self) -> str:
                return build_admin_prompt("You are a helpful agent...")

            async def execute(self, input: MyInput) -> AgentResult[MyOutput]:
                # Implementation
                ...
        ```
    """

    def __init__(
        self,
        client: AnthropicClient | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the agent.

        Args:
            client: Anthropic client (creates one if not provided)
            config: Agent configuration
        """
        self._client = client or AnthropicClient()
        self._config = config or AgentConfig()
        self._settings = get_settings()

        # Set default model from config if not specified
        if self._config.model is None:
            self._config.model = self._get_default_model()

    @abstractmethod
    def _get_default_model(self) -> str:
        """Get the default model for this agent type.

        Override in subclasses to specify which model to use.
        """
        ...

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Get the system prompt for this agent.

        Should include the constitution for admin agents.
        """
        ...

    @abstractmethod
    async def execute(self, input: TInput) -> AgentResult[TOutput]:
        """Execute the agent on the given input.

        Args:
            input: The input to process

        Returns:
            AgentResult containing the output and metadata
        """
        ...

    @property
    def name(self) -> str:
        """Get the agent's name."""
        return self.__class__.__name__

    @property
    def client(self) -> AnthropicClient:
        """Get the Anthropic client."""
        return self._client

    @property
    def config(self) -> AgentConfig:
        """Get the agent configuration."""
        return self._config

    async def _complete(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        """Make a completion request.

        Args:
            messages: The messages to send
            system: System prompt (defaults to get_system_prompt())

        Returns:
            The completion text
        """
        result = await self._client.complete(
            messages=messages,
            system=system or self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )
        return result.content

    def _log_execution(
        self,
        input_summary: str,
        output_summary: str,
        execution_time_ms: float,
        usage: TokenUsage | None = None,
    ) -> None:
        """Log agent execution."""
        logger.info(
            "Agent execution",
            agent=self.name,
            input_summary=input_summary[:100],
            output_summary=output_summary[:100],
            execution_time_ms=execution_time_ms,
            input_tokens=usage.input_tokens if usage else None,
            output_tokens=usage.output_tokens if usage else None,
        )


class ProcessingAgent(BaseAgent[TInput, TOutput]):
    """Base class for processing agents (Extractor, Matcher, Decomposer, Assessor).

    Processing agents transform data in the claim pipeline.
    """

    def _get_default_model(self) -> str:
        """Processing agents use the extraction model by default."""
        return self._settings.llm.extraction_model


class GovernanceAgent(BaseAgent[TInput, TOutput]):
    """Base class for governance agents (Steward, Reviewer, Arbitrator, Auditor).

    Governance agents manage the knowledge graph and handle contributions.
    """

    def _get_default_model(self) -> str:
        """Governance agents use the governance model by default."""
        return self._settings.llm.governance_model
