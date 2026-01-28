"""LLM integration layer for Episteme.

This module provides:
- Anthropic client wrapper with rate limiting and retries
- Agent base classes and implementations
- Prompt templates with constitution integration
- Tools for agents to interact with the knowledge graph
"""

from episteme.llm.client import (
    AnthropicClient,
    CompletionResult,
    ToolCompletionResult,
    ToolUse,
    TokenUsage,
)
from episteme.llm.agents.base import BaseAgent, ProcessingAgent, GovernanceAgent, AgentResult

__all__ = [
    "AnthropicClient",
    "CompletionResult",
    "ToolCompletionResult",
    "ToolUse",
    "TokenUsage",
    "BaseAgent",
    "ProcessingAgent",
    "GovernanceAgent",
    "AgentResult",
]
