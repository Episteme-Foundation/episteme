"""Prompt templates for Episteme LLM agents.

All admin agents follow a layered prompt architecture:
1. Layer 1: Admin Constitution (cached, immutable)
2. Layer 2: Role-specific system prompt
3. Layer 3: Task context

This ensures consistent epistemic principles across all agents.
"""

from episteme.llm.prompts.constitution import (
    get_constitution,
    build_admin_prompt,
)
from episteme.llm.prompts.extractor import ExtractorPrompts
from episteme.llm.prompts.matcher import MatcherPrompts
from episteme.llm.prompts.decomposer import DecomposerPrompts
from episteme.llm.prompts.assessor import AssessorPrompts
from episteme.llm.prompts.policies import GovernancePolicies
from episteme.llm.prompts.claim_steward import ClaimStewardPrompts
from episteme.llm.prompts.contribution_reviewer import ContributionReviewerPrompts
from episteme.llm.prompts.dispute_arbitrator import DisputeArbitratorPrompts
from episteme.llm.prompts.audit_agent import AuditAgentPrompts

__all__ = [
    "get_constitution",
    "build_admin_prompt",
    "ExtractorPrompts",
    "MatcherPrompts",
    "DecomposerPrompts",
    "AssessorPrompts",
    "GovernancePolicies",
    "ClaimStewardPrompts",
    "ContributionReviewerPrompts",
    "DisputeArbitratorPrompts",
    "AuditAgentPrompts",
]
