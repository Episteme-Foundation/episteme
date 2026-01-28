"""Anthropic API client wrapper with rate limiting and structured outputs.

Provides a unified interface for LLM operations with:
- Automatic retries with exponential backoff
- Rate limiting to stay within API limits
- Structured output parsing via tool use
- Token usage tracking
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, TypeVar, Type
import json

import structlog
from anthropic import AsyncAnthropic, APIError, RateLimitError
from pydantic import BaseModel
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from episteme.config import get_settings

logger = structlog.get_logger()

T = TypeVar("T", bound=BaseModel)


@dataclass
class TokenUsage:
    """Track token usage for cost monitoring."""

    input_tokens: int = 0
    output_tokens: int = 0
    timestamp: datetime = field(default_factory=datetime.utcnow)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass
class ToolUse:
    """A tool use request from the model."""

    id: str
    name: str
    input: dict[str, Any]


@dataclass
class CompletionResult:
    """Result from a completion request."""

    content: str
    model: str
    usage: TokenUsage
    stop_reason: str | None = None


@dataclass
class ToolCompletionResult:
    """Result from a completion request with tools."""

    content: str
    model: str
    usage: TokenUsage
    stop_reason: str | None = None
    tool_uses: list[ToolUse] = field(default_factory=list)
    raw_content: list[Any] = field(default_factory=list)


class RateLimiter:
    """Simple rate limiter for API requests."""

    def __init__(
        self,
        requests_per_minute: int = 60,
        tokens_per_minute: int = 100000,
    ) -> None:
        self._requests_per_minute = requests_per_minute
        self._tokens_per_minute = tokens_per_minute
        self._request_times: list[datetime] = []
        self._token_counts: list[tuple[datetime, int]] = []
        self._lock = asyncio.Lock()

    async def acquire(self, estimated_tokens: int = 1000) -> None:
        """Wait until we can make a request within rate limits."""
        async with self._lock:
            now = datetime.utcnow()
            minute_ago = now - timedelta(minutes=1)

            # Clean old entries
            self._request_times = [t for t in self._request_times if t > minute_ago]
            self._token_counts = [(t, c) for t, c in self._token_counts if t > minute_ago]

            # Check request limit
            while len(self._request_times) >= self._requests_per_minute:
                wait_time = (self._request_times[0] - minute_ago).total_seconds()
                if wait_time > 0:
                    await asyncio.sleep(wait_time + 0.1)
                now = datetime.utcnow()
                minute_ago = now - timedelta(minutes=1)
                self._request_times = [t for t in self._request_times if t > minute_ago]

            # Check token limit
            current_tokens = sum(c for _, c in self._token_counts)
            while current_tokens + estimated_tokens > self._tokens_per_minute:
                wait_time = (self._token_counts[0][0] - minute_ago).total_seconds()
                if wait_time > 0:
                    await asyncio.sleep(wait_time + 0.1)
                now = datetime.utcnow()
                minute_ago = now - timedelta(minutes=1)
                self._token_counts = [(t, c) for t, c in self._token_counts if t > minute_ago]
                current_tokens = sum(c for _, c in self._token_counts)

            # Record this request
            self._request_times.append(now)

    def record_tokens(self, tokens: int) -> None:
        """Record token usage after a request."""
        self._token_counts.append((datetime.utcnow(), tokens))


class AnthropicClient:
    """Async client for Anthropic API with rate limiting and structured outputs.

    Example:
        ```python
        client = AnthropicClient()

        # Simple completion
        result = await client.complete(
            messages=[{"role": "user", "content": "Hello!"}],
            system="You are a helpful assistant.",
        )

        # Structured output
        class ExtractedClaim(BaseModel):
            text: str
            confidence: float

        claims = await client.complete_structured(
            messages=[{"role": "user", "content": doc}],
            system="Extract claims from this document.",
            response_model=list[ExtractedClaim],
        )
        ```
    """

    def __init__(
        self,
        api_key: str | None = None,
        default_model: str | None = None,
    ) -> None:
        """Initialize the Anthropic client.

        Args:
            api_key: Anthropic API key (defaults to config)
            default_model: Default model to use (defaults to config)
        """
        settings = get_settings()
        self._api_key = api_key or settings.llm.anthropic_api_key.get_secret_value()
        self._default_model = default_model or settings.llm.extraction_model
        self._client = AsyncAnthropic(api_key=self._api_key)
        self._rate_limiter = RateLimiter(
            requests_per_minute=settings.llm.max_requests_per_minute,
            tokens_per_minute=settings.llm.max_tokens_per_minute,
        )
        self._total_usage = TokenUsage()

    @retry(
        retry=retry_if_exception_type((RateLimitError, APIError)),
        wait=wait_exponential(multiplier=1, min=1, max=60),
        stop=stop_after_attempt(5),
    )
    async def complete(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
        tools: list[dict] | None = None,
    ) -> CompletionResult:
        """Make a completion request.

        Args:
            messages: List of message dicts with "role" and "content"
            system: System prompt
            model: Model to use (defaults to default_model)
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            tools: Tool definitions for function calling

        Returns:
            CompletionResult with content and usage
        """
        model = model or self._default_model

        # Estimate tokens for rate limiting (rough estimate)
        estimated_tokens = sum(len(m.get("content", "")) // 4 for m in messages)
        await self._rate_limiter.acquire(estimated_tokens)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        response = await self._client.messages.create(**kwargs)

        # Track usage
        usage = TokenUsage(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )
        self._rate_limiter.record_tokens(usage.total_tokens)
        self._total_usage.input_tokens += usage.input_tokens
        self._total_usage.output_tokens += usage.output_tokens

        # Extract content
        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        logger.debug(
            "Completion request",
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
        )

        return CompletionResult(
            content=content,
            model=model,
            usage=usage,
            stop_reason=response.stop_reason,
        )

    async def complete_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> ToolCompletionResult:
        """Make a completion request with tools, returning tool calls.

        Args:
            messages: List of message dicts
            tools: Tool definitions
            system: System prompt
            model: Model to use
            max_tokens: Maximum tokens
            temperature: Sampling temperature

        Returns:
            ToolCompletionResult with content, tool uses, and metadata
        """
        model = model or self._default_model

        # Handle different message content types for token estimation
        estimated_tokens = 0
        for m in messages:
            content = m.get("content", "")
            if isinstance(content, str):
                estimated_tokens += len(content) // 4
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and "content" in item:
                        estimated_tokens += len(str(item.get("content", ""))) // 4
        await self._rate_limiter.acquire(estimated_tokens)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "tools": tools,
        }
        if system:
            kwargs["system"] = system

        response = await self._client.messages.create(**kwargs)

        # Track usage
        usage = TokenUsage(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )
        self._rate_limiter.record_tokens(usage.total_tokens)
        self._total_usage.input_tokens += usage.input_tokens
        self._total_usage.output_tokens += usage.output_tokens

        # Extract content and tool calls
        text_content = ""
        tool_uses: list[ToolUse] = []

        for block in response.content:
            if hasattr(block, "text"):
                text_content += block.text
            elif block.type == "tool_use":
                tool_uses.append(ToolUse(
                    id=block.id,
                    name=block.name,
                    input=block.input,
                ))

        return ToolCompletionResult(
            content=text_content,
            model=model,
            usage=usage,
            stop_reason=response.stop_reason,
            tool_uses=tool_uses,
            raw_content=list(response.content),
        )

    async def complete_structured(
        self,
        messages: list[dict[str, Any]],
        response_model: Type[T],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> T:
        """Make a completion request with structured output.

        Uses tool use to enforce the response schema.

        Args:
            messages: List of message dicts
            response_model: Pydantic model for the response
            system: System prompt
            model: Model to use
            max_tokens: Maximum tokens
            temperature: Sampling temperature

        Returns:
            Parsed response as the specified Pydantic model
        """
        # Create a tool from the response model
        schema = response_model.model_json_schema()
        tool = {
            "name": "respond",
            "description": f"Provide the response as a {response_model.__name__}",
            "input_schema": schema,
        }

        # Add instruction to use the tool
        enhanced_system = system or ""
        enhanced_system += (
            "\n\nYou must use the 'respond' tool to provide your response. "
            "Do not respond with plain text."
        )

        result = await self.complete_with_tools(
            messages=messages,
            tools=[tool],
            system=enhanced_system,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        if not result.tool_uses:
            raise ValueError("Model did not use the respond tool")

        # Parse the response
        tool_input = result.tool_uses[0].input
        return response_model.model_validate(tool_input)

    async def complete_structured_list(
        self,
        messages: list[dict[str, Any]],
        item_model: Type[T],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> list[T]:
        """Make a completion request returning a list of structured items.

        Args:
            messages: List of message dicts
            item_model: Pydantic model for each item
            system: System prompt
            model: Model to use
            max_tokens: Maximum tokens
            temperature: Sampling temperature

        Returns:
            List of parsed items
        """
        # Create a wrapper model for the list
        schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": item_model.model_json_schema(),
                }
            },
            "required": ["items"],
        }

        tool = {
            "name": "respond",
            "description": f"Provide a list of {item_model.__name__} items",
            "input_schema": schema,
        }

        enhanced_system = system or ""
        enhanced_system += (
            "\n\nYou must use the 'respond' tool to provide your response. "
            "Do not respond with plain text."
        )

        result = await self.complete_with_tools(
            messages=messages,
            tools=[tool],
            system=enhanced_system,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        if not result.tool_uses:
            raise ValueError("Model did not use the respond tool")

        # Parse each item
        items_data = result.tool_uses[0].input.get("items", [])
        return [item_model.model_validate(item) for item in items_data]

    @property
    def total_usage(self) -> TokenUsage:
        """Get total token usage across all requests."""
        return self._total_usage

    def reset_usage(self) -> None:
        """Reset token usage counters."""
        self._total_usage = TokenUsage()
