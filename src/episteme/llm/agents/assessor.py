"""Assessor agent for evaluating claim validity.

The Assessor traverses decomposition trees bottom-up, aggregating subclaim
assessments to determine parent status. It produces transparent reasoning
traces explaining every assessment decision.
"""

import time
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, Field

from episteme.llm.agents.base import ProcessingAgent, AgentResult, AgentConfig
from episteme.llm.client import AnthropicClient
from episteme.llm.prompts.assessor import AssessorPrompts
from episteme.domain.claim import Claim, ClaimTree
from episteme.domain.assessment import Assessment
from episteme.domain.enums import AssessmentStatus


class AssessmentResponse(BaseModel):
    """Response model for a claim assessment."""

    status: str = Field(
        ...,
        description="One of: verified, contested, unsupported, unknown",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence in this assessment (0.0-1.0)",
    )
    reasoning_trace: str = Field(
        ...,
        description="Detailed explanation of how this assessment was reached",
    )
    evidence_for: list[str] = Field(
        default_factory=list,
        description="UUIDs of claims supporting this claim",
    )
    evidence_against: list[str] = Field(
        default_factory=list,
        description="UUIDs of claims contradicting this claim",
    )
    subclaim_summary: dict[str, int] = Field(
        default_factory=dict,
        description="Count of subclaims by status",
    )
    requires_more_evidence: bool = Field(
        default=False,
        description="Whether more evidence is needed for a confident assessment",
    )


@dataclass
class AssessmentInput:
    """Input for the Assessor agent."""

    claim: Claim
    subclaim_assessments: list[tuple[Claim, Assessment | None, str]]  # (claim, assessment, relation)
    instances: list[dict] | None = None
    is_atomic: bool = False
    atomic_type: str | None = None


class AssessorAgent(ProcessingAgent[AssessmentInput, Assessment]):
    """Agent for assessing claim validity.

    The Assessor evaluates claims by:
    1. For atomic claims: Assessing based on source quality and evidence
    2. For compound claims: Aggregating subclaim assessments bottom-up

    Example:
        ```python
        agent = AssessorAgent()

        result = await agent.execute(AssessmentInput(
            claim=claim,
            subclaim_assessments=[
                (subclaim1, assessment1, "requires"),
                (subclaim2, assessment2, "supports"),
            ],
        ))

        print(f"Status: {result.output.status}")
        print(f"Confidence: {result.output.confidence}")
        print(f"Reasoning: {result.output.reasoning_trace}")
        ```
    """

    def __init__(
        self,
        client: AnthropicClient | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        """Initialize the Assessor agent.

        Args:
            client: Anthropic client
            config: Agent configuration
        """
        super().__init__(client, config)

    def _get_default_model(self) -> str:
        """Assessor uses the governance model for careful reasoning."""
        return self._settings.llm.governance_model

    def get_system_prompt(self) -> str:
        """Get the system prompt with constitution."""
        return AssessorPrompts.get_system_prompt()

    async def execute(
        self,
        input: AssessmentInput,
    ) -> AgentResult[Assessment]:
        """Assess a claim based on its subclaims or as an atomic claim.

        Args:
            input: The claim to assess with subclaim assessments

        Returns:
            AgentResult containing the assessment
        """
        start_time = time.time()

        if input.is_atomic:
            assessment = await self._assess_atomic(input)
        else:
            assessment = await self._assess_compound(input)

        execution_time = (time.time() - start_time) * 1000

        self._log_execution(
            input_summary=f"Assess: {input.claim.canonical_form[:50]}...",
            output_summary=f"{assessment.status.value}: {assessment.confidence:.2f}",
            execution_time_ms=execution_time,
            usage=self._client.total_usage,
        )

        return AgentResult(
            output=assessment,
            reasoning=assessment.reasoning_trace,
            execution_time_ms=execution_time,
            metadata={
                "claim_id": str(input.claim.id),
                "status": assessment.status.value,
                "confidence": assessment.confidence,
                "is_atomic": input.is_atomic,
            },
        )

    async def _assess_atomic(self, input: AssessmentInput) -> Assessment:
        """Assess an atomic claim (no subclaims to aggregate)."""
        user_prompt = AssessorPrompts.get_atomic_assessment_prompt(
            canonical_form=input.claim.canonical_form,
            claim_type=input.claim.claim_type.value,
            atomic_type=input.atomic_type,
            instances=input.instances,
        )

        try:
            response = await self._client.complete_structured(
                messages=[{"role": "user", "content": user_prompt}],
                response_model=AssessmentResponse,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
        except Exception:
            # Fallback for atomic claims without enough info
            response = AssessmentResponse(
                status="unknown",
                confidence=0.0,
                reasoning_trace="Could not assess atomic claim - insufficient information",
                requires_more_evidence=True,
            )

        return self._response_to_assessment(response, input.claim.id)

    async def _assess_compound(self, input: AssessmentInput) -> Assessment:
        """Assess a compound claim by aggregating subclaim assessments."""
        # Format subclaims for prompt
        subclaims_data = []
        for subclaim, assessment, relation in input.subclaim_assessments:
            subclaims_data.append({
                "claim_id": str(subclaim.id),
                "canonical_form": subclaim.canonical_form,
                "relation": relation,
                "status": assessment.status.value if assessment else "UNKNOWN",
                "confidence": assessment.confidence if assessment else 0.0,
                "reasoning": assessment.reasoning_trace if assessment else "Not yet assessed",
            })

        user_prompt = AssessorPrompts.get_assessment_prompt(
            canonical_form=input.claim.canonical_form,
            claim_type=input.claim.claim_type.value,
            subclaims=subclaims_data,
        )

        try:
            response = await self._client.complete_structured(
                messages=[{"role": "user", "content": user_prompt}],
                response_model=AssessmentResponse,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
        except Exception:
            # Fallback: compute assessment heuristically
            response = self._compute_fallback_assessment(input.subclaim_assessments)

        return self._response_to_assessment(response, input.claim.id)

    def _compute_fallback_assessment(
        self,
        subclaim_assessments: list[tuple[Claim, Assessment | None, str]],
    ) -> AssessmentResponse:
        """Compute a heuristic assessment when LLM fails."""
        status_counts: dict[str, int] = {
            "verified": 0,
            "contested": 0,
            "unsupported": 0,
            "unknown": 0,
        }
        min_confidence = 1.0
        has_required_unsupported = False
        has_required_contested = False

        for subclaim, assessment, relation in subclaim_assessments:
            if assessment is None:
                status_counts["unknown"] += 1
                continue

            status_counts[assessment.status.value] += 1
            min_confidence = min(min_confidence, assessment.confidence)

            if relation.lower() == "requires":
                if assessment.status == AssessmentStatus.UNSUPPORTED:
                    has_required_unsupported = True
                elif assessment.status == AssessmentStatus.CONTESTED:
                    has_required_contested = True

        # Determine status based on required subclaims
        if has_required_unsupported:
            status = "unsupported"
        elif has_required_contested:
            status = "contested"
        elif status_counts["verified"] > 0 and status_counts["contested"] == 0:
            status = "verified"
        elif status_counts["unknown"] == len(subclaim_assessments):
            status = "unknown"
        else:
            status = "unknown"

        return AssessmentResponse(
            status=status,
            confidence=min_confidence * 0.9,  # Reduce confidence for heuristic
            reasoning_trace="Fallback heuristic assessment based on subclaim status counts",
            subclaim_summary=status_counts,
        )

    def _response_to_assessment(
        self,
        response: AssessmentResponse,
        claim_id: UUID,
    ) -> Assessment:
        """Convert API response to domain Assessment."""
        status = self._parse_status(response.status)

        return Assessment(
            claim_id=claim_id,
            status=status,
            confidence=response.confidence,
            reasoning_trace=response.reasoning_trace,
            evidence_for=[UUID(eid) for eid in response.evidence_for if eid],
            evidence_against=[UUID(eid) for eid in response.evidence_against if eid],
            assessed_by="assessor",
            subclaim_summary=response.subclaim_summary,
        )

    def _parse_status(self, status_str: str) -> AssessmentStatus:
        """Parse status string to enum."""
        status_map = {
            "verified": AssessmentStatus.VERIFIED,
            "contested": AssessmentStatus.CONTESTED,
            "unsupported": AssessmentStatus.UNSUPPORTED,
            "unknown": AssessmentStatus.UNKNOWN,
        }
        return status_map.get(status_str.lower(), AssessmentStatus.UNKNOWN)

    async def reassess(
        self,
        claim: Claim,
        previous_assessment: Assessment,
        trigger: str,
        changes: list[dict],
        subclaim_assessments: list[tuple[Claim, Assessment | None, str]],
    ) -> AgentResult[Assessment]:
        """Reassess a claim after changes to its subclaims.

        Args:
            claim: The claim to reassess
            previous_assessment: The previous assessment
            trigger: What triggered the reassessment
            changes: List of changes that occurred
            subclaim_assessments: Current subclaim assessments

        Returns:
            AgentResult with new assessment
        """
        start_time = time.time()

        user_prompt = AssessorPrompts.get_reassessment_prompt(
            canonical_form=claim.canonical_form,
            previous_assessment={
                "status": previous_assessment.status.value,
                "confidence": previous_assessment.confidence,
                "reasoning": previous_assessment.reasoning_trace,
            },
            trigger=trigger,
            changes=changes,
        )

        try:
            response = await self._client.complete_structured(
                messages=[{"role": "user", "content": user_prompt}],
                response_model=AssessmentResponse,
                system=self.get_system_prompt(),
                model=self._config.model,
                max_tokens=self._config.max_tokens,
                temperature=self._config.temperature,
            )
        except Exception:
            # Fallback to regular assessment
            return await self.execute(AssessmentInput(
                claim=claim,
                subclaim_assessments=subclaim_assessments,
            ))

        assessment = self._response_to_assessment(response, claim.id)
        execution_time = (time.time() - start_time) * 1000

        return AgentResult(
            output=assessment,
            reasoning=assessment.reasoning_trace,
            execution_time_ms=execution_time,
            metadata={
                "claim_id": str(claim.id),
                "trigger": trigger,
                "status_changed": previous_assessment.status != assessment.status,
            },
        )

    async def assess_tree(
        self,
        tree: ClaimTree,
        existing_assessments: dict[UUID, Assessment] | None = None,
    ) -> dict[UUID, Assessment]:
        """Assess all claims in a tree bottom-up.

        Args:
            tree: The claim tree to assess
            existing_assessments: Optional existing assessments to use

        Returns:
            Dict mapping claim IDs to their assessments
        """
        assessments: dict[UUID, Assessment] = existing_assessments or {}

        # Process bottom-up using post-order traversal
        await self._assess_tree_recursive(tree, assessments)

        return assessments

    async def _assess_tree_recursive(
        self,
        tree: ClaimTree,
        assessments: dict[UUID, Assessment],
    ) -> Assessment:
        """Recursively assess a claim tree."""
        # First, assess all children
        subclaim_assessments: list[tuple[Claim, Assessment | None, str]] = []

        for child_tree, decomposition in tree.children:
            if child_tree.claim.id not in assessments:
                child_assessment = await self._assess_tree_recursive(child_tree, assessments)
                assessments[child_tree.claim.id] = child_assessment
            else:
                child_assessment = assessments[child_tree.claim.id]

            subclaim_assessments.append((
                child_tree.claim,
                child_assessment,
                decomposition.relation.value,
            ))

        # Now assess this claim
        is_atomic = tree.is_leaf
        result = await self.execute(AssessmentInput(
            claim=tree.claim,
            subclaim_assessments=subclaim_assessments,
            is_atomic=is_atomic,
        ))

        assessments[tree.claim.id] = result.output
        return result.output

    async def batch_assess(
        self,
        claims_with_subclaims: list[AssessmentInput],
    ) -> list[AgentResult[Assessment]]:
        """Assess multiple claims.

        Args:
            claims_with_subclaims: List of assessment inputs

        Returns:
            List of assessment results
        """
        results = []
        for input in claims_with_subclaims:
            result = await self.execute(input)
            results.append(result)
        return results
