"""LLM agents for Episteme.

Agents are specialized LLM-powered components that perform specific tasks
in the claim processing pipeline. All admin agents receive the constitution
as Layer 1 of their prompt.

Agent types:
- **Processing agents**: Extractor, Matcher, Decomposer, Assessor
- **Governance agents**: ClaimSteward, ContributionReviewer, DisputeArbitrator, AuditAgent
"""

from episteme.llm.agents.base import BaseAgent, ProcessingAgent, GovernanceAgent, AgentConfig, AgentResult
from episteme.llm.agents.extractor import ExtractorAgent
from episteme.llm.agents.matcher import MatcherAgent
from episteme.llm.agents.decomposer import DecomposerAgent
from episteme.llm.agents.assessor import AssessorAgent
from episteme.llm.agents.claim_steward import ClaimStewardAgent
from episteme.llm.agents.contribution_reviewer import ContributionReviewerAgent
from episteme.llm.agents.dispute_arbitrator import DisputeArbitratorAgent
from episteme.llm.agents.audit_agent import AuditAgent

__all__ = [
    "BaseAgent",
    "ProcessingAgent",
    "GovernanceAgent",
    "AgentConfig",
    "AgentResult",
    "ExtractorAgent",
    "MatcherAgent",
    "DecomposerAgent",
    "AssessorAgent",
    "ClaimStewardAgent",
    "ContributionReviewerAgent",
    "DisputeArbitratorAgent",
    "AuditAgent",
]
