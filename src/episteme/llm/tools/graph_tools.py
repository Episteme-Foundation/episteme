"""Graph tools for LLM agents.

These tools allow agents to query the claim graph during processing.
They're designed to be used with Anthropic's tool use feature.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog

from episteme.storage.repositories.claim_repository import ClaimRepository
from episteme.storage.vector.client import SimilarClaim
from episteme.domain.claim import Claim, ClaimTree

logger = structlog.get_logger()


@dataclass
class ToolResult:
    """Result from a tool execution."""

    success: bool
    data: Any
    error: str | None = None


class GraphTools:
    """Tools for querying the claim graph.

    These tools are provided to LLM agents to help them:
    - Find existing claims that match extracted/decomposed claims
    - Understand the structure of the claim graph
    - Make informed decisions about matching vs creating claims

    Example:
        ```python
        tools = GraphTools(repository)

        # Search for similar claims
        result = await tools.search_similar_claims(
            "US inflation exceeded 5% in 2022",
            limit=5
        )

        # Get claim details
        result = await tools.get_claim_details(claim_id)
        ```
    """

    def __init__(self, repository: ClaimRepository) -> None:
        """Initialize graph tools.

        Args:
            repository: Claim repository for database access
        """
        self._repository = repository

    def get_tool_definitions(self) -> list[dict[str, Any]]:
        """Get Anthropic tool definitions for these tools.

        Returns:
            List of tool definitions for the API
        """
        return [
            {
                "name": "search_similar_claims",
                "description": (
                    "Search for existing claims in the knowledge graph that are "
                    "semantically similar to a query. Use this to find claims that "
                    "might match a new claim or subclaim before creating a new one."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The claim text to search for",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (default 10)",
                            "default": 10,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "get_claim_details",
                "description": (
                    "Get detailed information about a specific claim, including "
                    "its canonical form, type, state, and any alternative forms."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "claim_id": {
                            "type": "string",
                            "description": "The UUID of the claim to retrieve",
                        },
                    },
                    "required": ["claim_id"],
                },
            },
            {
                "name": "get_claim_subclaims",
                "description": (
                    "Get all direct subclaims of a claim. Returns the subclaims "
                    "and their relationships to the parent claim."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "claim_id": {
                            "type": "string",
                            "description": "The UUID of the parent claim",
                        },
                    },
                    "required": ["claim_id"],
                },
            },
            {
                "name": "get_claim_tree",
                "description": (
                    "Get the full decomposition tree of a claim, including all "
                    "nested subclaims up to a specified depth."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "claim_id": {
                            "type": "string",
                            "description": "The UUID of the root claim",
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Maximum depth to traverse (default 3)",
                            "default": 3,
                        },
                    },
                    "required": ["claim_id"],
                },
            },
            {
                "name": "check_claim_exists",
                "description": (
                    "Check if a claim with a given ID exists in the graph. "
                    "Returns basic existence information."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "claim_id": {
                            "type": "string",
                            "description": "The UUID of the claim to check",
                        },
                    },
                    "required": ["claim_id"],
                },
            },
            {
                "name": "get_parent_claims",
                "description": (
                    "Get all claims that have a given claim as a subclaim. "
                    "Useful for understanding how a claim fits into the graph."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "claim_id": {
                            "type": "string",
                            "description": "The UUID of the child claim",
                        },
                    },
                    "required": ["claim_id"],
                },
            },
        ]

    async def execute_tool(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
    ) -> ToolResult:
        """Execute a tool by name with given input.

        Args:
            tool_name: Name of the tool to execute
            tool_input: Tool input parameters

        Returns:
            ToolResult with success status and data/error
        """
        try:
            if tool_name == "search_similar_claims":
                return await self._search_similar_claims(
                    query=tool_input["query"],
                    limit=tool_input.get("limit", 10),
                )
            elif tool_name == "get_claim_details":
                return await self._get_claim_details(
                    claim_id=tool_input["claim_id"],
                )
            elif tool_name == "get_claim_subclaims":
                return await self._get_claim_subclaims(
                    claim_id=tool_input["claim_id"],
                )
            elif tool_name == "get_claim_tree":
                return await self._get_claim_tree(
                    claim_id=tool_input["claim_id"],
                    max_depth=tool_input.get("max_depth", 3),
                )
            elif tool_name == "check_claim_exists":
                return await self._check_claim_exists(
                    claim_id=tool_input["claim_id"],
                )
            elif tool_name == "get_parent_claims":
                return await self._get_parent_claims(
                    claim_id=tool_input["claim_id"],
                )
            else:
                return ToolResult(
                    success=False,
                    data=None,
                    error=f"Unknown tool: {tool_name}",
                )
        except Exception as e:
            logger.error("Tool execution failed", tool=tool_name, error=str(e))
            return ToolResult(
                success=False,
                data=None,
                error=str(e),
            )

    async def _search_similar_claims(
        self,
        query: str,
        limit: int = 10,
    ) -> ToolResult:
        """Search for semantically similar claims."""
        similar = await self._repository.find_similar_claims(query, limit=limit)

        results = []
        for s in similar:
            results.append({
                "claim_id": str(s.claim_id),
                "canonical_form": s.canonical_form,
                "similarity_score": s.score,
                "claim_type": s.metadata.get("claim_type") if s.metadata else None,
                "state": s.metadata.get("state") if s.metadata else None,
            })

        logger.info(
            "Searched similar claims",
            query=query[:50],
            result_count=len(results),
        )

        return ToolResult(
            success=True,
            data={
                "query": query,
                "results": results,
                "count": len(results),
            },
        )

    async def _get_claim_details(self, claim_id: str) -> ToolResult:
        """Get details about a specific claim."""
        try:
            claim_uuid = UUID(claim_id)
        except ValueError:
            return ToolResult(
                success=False,
                data=None,
                error=f"Invalid claim ID format: {claim_id}",
            )

        claim = await self._repository.get_claim(claim_uuid)
        if claim is None:
            return ToolResult(
                success=False,
                data=None,
                error=f"Claim not found: {claim_id}",
            )

        return ToolResult(
            success=True,
            data={
                "claim_id": str(claim.id),
                "canonical_form": claim.canonical_form,
                "claim_type": claim.claim_type.value,
                "state": claim.state.value,
                "alternative_forms": claim.alternative_forms,
                "created_at": claim.created_at.isoformat(),
                "created_by": claim.created_by,
            },
        )

    async def _get_claim_subclaims(self, claim_id: str) -> ToolResult:
        """Get direct subclaims of a claim."""
        try:
            claim_uuid = UUID(claim_id)
        except ValueError:
            return ToolResult(
                success=False,
                data=None,
                error=f"Invalid claim ID format: {claim_id}",
            )

        subclaims = await self._repository.get_subclaims(claim_uuid)

        results = []
        for subclaim, decomposition in subclaims:
            results.append({
                "subclaim_id": str(subclaim.id),
                "canonical_form": subclaim.canonical_form,
                "claim_type": subclaim.claim_type.value,
                "relation": decomposition.relation.value,
                "reasoning": decomposition.reasoning,
                "confidence": decomposition.confidence,
            })

        return ToolResult(
            success=True,
            data={
                "parent_claim_id": claim_id,
                "subclaims": results,
                "count": len(results),
            },
        )

    async def _get_claim_tree(
        self,
        claim_id: str,
        max_depth: int = 3,
    ) -> ToolResult:
        """Get the decomposition tree of a claim."""
        try:
            claim_uuid = UUID(claim_id)
        except ValueError:
            return ToolResult(
                success=False,
                data=None,
                error=f"Invalid claim ID format: {claim_id}",
            )

        tree = await self._repository.get_claim_tree(claim_uuid, max_depth=max_depth)
        if tree is None:
            return ToolResult(
                success=False,
                data=None,
                error=f"Claim not found: {claim_id}",
            )

        def serialize_tree(t: ClaimTree) -> dict:
            """Recursively serialize a claim tree."""
            return {
                "claim_id": str(t.claim.id),
                "canonical_form": t.claim.canonical_form,
                "claim_type": t.claim.claim_type.value,
                "is_leaf": t.is_leaf,
                "depth": t.depth,
                "children": [
                    {
                        "relation": decomp.relation.value,
                        "reasoning": decomp.reasoning,
                        "subtree": serialize_tree(child),
                    }
                    for child, decomp in t.children
                ],
            }

        return ToolResult(
            success=True,
            data={
                "root_claim_id": claim_id,
                "max_depth": max_depth,
                "tree": serialize_tree(tree),
                "total_claims": len(tree.get_all_claims()),
                "leaf_claims": len(tree.get_leaf_claims()),
            },
        )

    async def _check_claim_exists(self, claim_id: str) -> ToolResult:
        """Check if a claim exists in the graph."""
        try:
            claim_uuid = UUID(claim_id)
        except ValueError:
            return ToolResult(
                success=True,
                data={"exists": False, "error": "Invalid UUID format"},
            )

        claim = await self._repository.get_claim(claim_uuid)
        exists = claim is not None

        return ToolResult(
            success=True,
            data={
                "claim_id": claim_id,
                "exists": exists,
                "canonical_form": claim.canonical_form if claim else None,
                "state": claim.state.value if claim else None,
            },
        )

    async def _get_parent_claims(self, claim_id: str) -> ToolResult:
        """Get claims that have this claim as a subclaim."""
        try:
            claim_uuid = UUID(claim_id)
        except ValueError:
            return ToolResult(
                success=False,
                data=None,
                error=f"Invalid claim ID format: {claim_id}",
            )

        parents = await self._repository.get_parent_claims(claim_uuid)

        results = []
        for parent, decomposition in parents:
            results.append({
                "parent_claim_id": str(parent.id),
                "canonical_form": parent.canonical_form,
                "claim_type": parent.claim_type.value,
                "relation": decomposition.relation.value,
                "reasoning": decomposition.reasoning,
            })

        return ToolResult(
            success=True,
            data={
                "child_claim_id": claim_id,
                "parents": results,
                "count": len(results),
            },
        )


def format_tool_result_for_llm(result: ToolResult) -> str:
    """Format a tool result as a string for LLM consumption.

    Args:
        result: The tool result to format

    Returns:
        Formatted string for inclusion in LLM messages
    """
    import json

    if not result.success:
        return f"Error: {result.error}"

    return json.dumps(result.data, indent=2)
