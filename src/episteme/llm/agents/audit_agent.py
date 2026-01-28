"""Audit Agent for quality control.

The Audit Agent reviews decisions for quality and consistency, identifies
issues, and ensures the governance system is functioning properly.
"""

import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from episteme.domain.contribution import ContributionReview, ArbitrationResult
from episteme.domain.contributor import Contributor
from episteme.llm.agents.base import GovernanceAgent, AgentConfig, AgentResult
from episteme.llm.prompts.audit_agent import AuditAgentPrompts

logger = structlog.get_logger()


@dataclass
class AuditInput:
    """Input for audit."""

    audit_type: str  # decision_audit, pattern_analysis, contributor_review, anomaly_investigation
    # Context varies by audit type
    decision: ContributionReview | ArbitrationResult | None = None
    contribution: dict | None = None
    claim: dict | None = None
    contributor: dict | None = None
    decisions: list[dict] = field(default_factory=list)
    time_period: str = ""
    focus_area: str | None = None
    recent_contributions: list[dict] = field(default_factory=list)
    anomaly_type: str = ""
    anomaly_details: dict = field(default_factory=dict)
    related_data: list[dict] = field(default_factory=list)


@dataclass
class AuditIssue:
    """An issue found during audit."""

    severity: str  # low, medium, high, critical
    category: str  # quality, consistency, process, red_flag
    description: str
    evidence: str
    recommendation: str


@dataclass
class AuditOutput:
    """Output from an audit."""

    quality_score: float
    metrics: dict[str, float]  # DQ, CO, PC scores
    issues_found: list[AuditIssue]
    severity: str  # none, low, medium, high, critical
    recommendations: list[str]
    re_review_needed: bool
    contributor_impact: str | None
    systemic_concerns: list[str]


class AuditAgent(GovernanceAgent[AuditInput, AuditOutput]):
    """Agent that audits decisions for quality and consistency.

    The Audit Agent handles:
    - Individual decision audits
    - Pattern analysis across many decisions
    - Contributor behavior review
    - Anomaly investigation

    Example:
        ```python
        agent = AuditAgent(client)

        # Audit a single decision
        result = await agent.execute(AuditInput(
            audit_type="decision_audit",
            decision=review_decision,
            contribution=contribution_dict,
            claim=claim_dict,
            contributor=contributor_dict,
        ))

        if result.output.severity in ["high", "critical"]:
            # Flag for human review
            ...
        ```
    """

    def __init__(
        self,
        client=None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the audit agent."""
        super().__init__(client=client, config=config or AgentConfig(temperature=0.0))

    def get_system_prompt(self) -> str:
        """Get the system prompt."""
        return AuditAgentPrompts.get_system_prompt()

    async def execute(
        self,
        input: AuditInput,
    ) -> AgentResult[AuditOutput]:
        """Execute the audit.

        Args:
            input: The audit input

        Returns:
            AgentResult containing the audit findings
        """
        start_time = time.time()

        # Build the appropriate prompt
        if input.audit_type == "decision_audit":
            user_prompt = self._build_decision_audit_prompt(input)
        elif input.audit_type == "pattern_analysis":
            user_prompt = self._build_pattern_analysis_prompt(input)
        elif input.audit_type == "contributor_review":
            user_prompt = self._build_contributor_review_prompt(input)
        elif input.audit_type == "anomaly_investigation":
            user_prompt = self._build_anomaly_prompt(input)
        else:
            raise ValueError(f"Unknown audit type: {input.audit_type}")

        # Get LLM response
        result = await self._client.complete(
            messages=[{"role": "user", "content": user_prompt}],
            system=self.get_system_prompt(),
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            temperature=self._config.temperature,
        )

        # Parse the response
        output = self._parse_response(result.content, input)

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"Audit type={input.audit_type}",
            output_summary=f"severity={output.severity}, issues={len(output.issues_found)}",
            execution_time_ms=execution_time,
            usage=result.usage,
        )

        return AgentResult(
            output=output,
            reasoning="\n".join(output.recommendations),
            usage=result.usage,
            execution_time_ms=execution_time,
            metadata={
                "audit_type": input.audit_type,
                "issues_count": len(output.issues_found),
            },
        )

    def _build_decision_audit_prompt(self, input: AuditInput) -> str:
        """Build prompt for decision audit."""
        if not input.decision:
            raise ValueError("Decision audit requires a decision")

        # Convert decision to dict
        if isinstance(input.decision, ContributionReview):
            decision_dict = {
                "decision": input.decision.decision.value,
                "reasoning": input.decision.reasoning,
                "confidence": input.decision.confidence,
                "policy_citations": input.decision.policy_citations,
                "actions": input.decision.actions_if_accepted,
                "reviewed_by": input.decision.reviewed_by,
            }
        else:  # ArbitrationResult
            decision_dict = {
                "decision": input.decision.outcome.value,
                "reasoning": input.decision.reasoning,
                "confidence": 0.0,  # Not stored in ArbitrationResult
                "policy_citations": [],
                "actions": [input.decision.decision],
                "reviewed_by": input.decision.arbitrated_by,
            }

        return AuditAgentPrompts.get_decision_audit_prompt(
            decision=decision_dict,
            contribution=input.contribution or {},
            claim=input.claim or {},
            contributor=input.contributor or {},
        )

    def _build_pattern_analysis_prompt(self, input: AuditInput) -> str:
        """Build prompt for pattern analysis."""
        return AuditAgentPrompts.get_pattern_analysis_prompt(
            decisions=input.decisions,
            time_period=input.time_period,
            focus_area=input.focus_area,
        )

    def _build_contributor_review_prompt(self, input: AuditInput) -> str:
        """Build prompt for contributor review."""
        return AuditAgentPrompts.get_contributor_review_prompt(
            contributor=input.contributor or {},
            recent_contributions=input.recent_contributions,
            recent_decisions=input.decisions,
        )

    def _build_anomaly_prompt(self, input: AuditInput) -> str:
        """Build prompt for anomaly investigation."""
        return AuditAgentPrompts.get_anomaly_investigation_prompt(
            anomaly_type=input.anomaly_type,
            anomaly_details=input.anomaly_details,
            related_data=input.related_data,
        )

    def _parse_response(self, response: str, input: AuditInput) -> AuditOutput:
        """Parse the LLM response into an audit output."""
        response_lower = response.lower()

        # Extract quality score
        import re
        quality_score = 0.8  # Default to good
        quality_match = re.search(r"quality[_\s]?score[:\s]+(\d+\.?\d*)", response_lower)
        if quality_match:
            try:
                quality_score = float(quality_match.group(1))
                if quality_score > 1.0:
                    quality_score /= 100
            except ValueError:
                pass

        # Extract individual metrics
        metrics = {
            "decision_quality": 0.8,
            "consistency": 0.8,
            "process_compliance": 0.8,
        }
        for metric in ["decision_quality", "consistency", "process_compliance"]:
            metric_pattern = metric.replace("_", "[_\\s]?")
            metric_match = re.search(rf"{metric_pattern}[:\s]+(\d+\.?\d*)", response_lower)
            if metric_match:
                try:
                    val = float(metric_match.group(1))
                    metrics[metric] = val / 100 if val > 1.0 else val
                except ValueError:
                    pass

        # Extract issues
        issues = []
        severity_level = "none"

        # Look for issue indicators
        if "critical" in response_lower:
            severity_level = "critical"
            issues.append(AuditIssue(
                severity="critical",
                category="red_flag",
                description="Critical issue identified",
                evidence="See full audit response",
                recommendation="Immediate review required",
            ))
        elif "high" in response_lower and ("issue" in response_lower or "concern" in response_lower or "problem" in response_lower):
            severity_level = "high"
            issues.append(AuditIssue(
                severity="high",
                category="quality",
                description="High severity issue identified",
                evidence="See full audit response",
                recommendation="Review recommended",
            ))
        elif "medium" in response_lower and ("issue" in response_lower or "concern" in response_lower):
            severity_level = "medium"
            issues.append(AuditIssue(
                severity="medium",
                category="quality",
                description="Medium severity issue identified",
                evidence="See full audit response",
                recommendation="Consider review",
            ))
        elif "low" in response_lower and ("issue" in response_lower or "minor" in response_lower):
            severity_level = "low"
            issues.append(AuditIssue(
                severity="low",
                category="quality",
                description="Low severity issue identified",
                evidence="See full audit response",
                recommendation="Note for future reference",
            ))

        # Extract recommendations
        recommendations = []
        if "recommend" in response_lower:
            # Try to extract recommendation sentences
            sentences = response.split(".")
            for sentence in sentences:
                if "recommend" in sentence.lower():
                    recommendations.append(sentence.strip() + ".")
        if not recommendations:
            recommendations = ["No specific recommendations"]

        # Determine if re-review is needed
        re_review_needed = (
            severity_level in ["high", "critical"] or
            "re-review" in response_lower or
            "reconsider" in response_lower
        )

        # Check for contributor impact
        contributor_impact = None
        if "reputation" in response_lower or "trust" in response_lower:
            if "adjust" in response_lower or "update" in response_lower:
                contributor_impact = "Consider reputation adjustment"

        # Check for systemic concerns
        systemic_concerns = []
        if "pattern" in response_lower or "systematic" in response_lower:
            if "concern" in response_lower or "issue" in response_lower:
                systemic_concerns.append("Potential systematic issue detected")
        if "manipulation" in response_lower or "gaming" in response_lower:
            systemic_concerns.append("Possible manipulation detected")

        return AuditOutput(
            quality_score=quality_score,
            metrics=metrics,
            issues_found=issues,
            severity=severity_level,
            recommendations=recommendations,
            re_review_needed=re_review_needed,
            contributor_impact=contributor_impact,
            systemic_concerns=systemic_concerns,
        )

    async def audit_decision(
        self,
        decision: ContributionReview | ArbitrationResult,
        contribution: dict,
        claim: dict,
        contributor: dict,
    ) -> AgentResult[AuditOutput]:
        """Convenience method to audit a single decision.

        Args:
            decision: The decision to audit
            contribution: The contribution dict
            claim: The claim dict
            contributor: The contributor dict

        Returns:
            AgentResult with audit findings
        """
        return await self.execute(AuditInput(
            audit_type="decision_audit",
            decision=decision,
            contribution=contribution,
            claim=claim,
            contributor=contributor,
        ))

    async def analyze_patterns(
        self,
        decisions: list[dict],
        time_period: str,
        focus_area: str | None = None,
    ) -> AgentResult[AuditOutput]:
        """Convenience method to analyze decision patterns.

        Args:
            decisions: List of decisions to analyze
            time_period: The time period covered
            focus_area: Optional focus area

        Returns:
            AgentResult with pattern analysis
        """
        return await self.execute(AuditInput(
            audit_type="pattern_analysis",
            decisions=decisions,
            time_period=time_period,
            focus_area=focus_area,
        ))

    async def review_contributor(
        self,
        contributor: dict,
        recent_contributions: list[dict],
        recent_decisions: list[dict],
    ) -> AgentResult[AuditOutput]:
        """Convenience method to review a contributor's history.

        Args:
            contributor: The contributor to review
            recent_contributions: Their recent contributions
            recent_decisions: Decisions on their contributions

        Returns:
            AgentResult with contributor review
        """
        return await self.execute(AuditInput(
            audit_type="contributor_review",
            contributor=contributor,
            recent_contributions=recent_contributions,
            decisions=recent_decisions,
        ))

    async def investigate_anomaly(
        self,
        anomaly_type: str,
        anomaly_details: dict,
        related_data: list[dict],
    ) -> AgentResult[AuditOutput]:
        """Convenience method to investigate a detected anomaly.

        Args:
            anomaly_type: Type of anomaly
            anomaly_details: Details about the anomaly
            related_data: Related decisions/contributions

        Returns:
            AgentResult with investigation findings
        """
        return await self.execute(AuditInput(
            audit_type="anomaly_investigation",
            anomaly_type=anomaly_type,
            anomaly_details=anomaly_details,
            related_data=related_data,
        ))
