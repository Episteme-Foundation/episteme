"""Admin Constitution loader and prompt builder.

The Admin Constitution establishes the epistemic principles that govern
all LLM agents in the system. Every admin agent receives the full
constitution as Layer 1 of their prompt, ensuring consistent behavior.

Prompt Architecture:
┌─────────────────────────────────────────────┐
│ LAYER 1: Admin Constitution (cached)        │
│ - Full text of admin_constitution.md        │
│ - Immutable across all admin agents         │
│ - Establishes epistemic principles          │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ LAYER 2: Role-Specific System Prompt        │
│ - Defines the agent's specific role         │
│ - Lists responsibilities and triggers       │
│ - Specifies available tools                 │
│ - Provides output format requirements       │
└─────────────────────────────────────────────┘
"""

from functools import lru_cache
from pathlib import Path

import structlog

logger = structlog.get_logger()

# Path to the constitution file (relative to project root)
CONSTITUTION_PATH = Path(__file__).parent.parent.parent.parent.parent / "admin_constitution.md"

# Fallback constitution summary if file not found
CONSTITUTION_FALLBACK = """
# Admin Constitution Summary

## Core Epistemic Commitments

1. **Clarity Over Resolution**: Map the structure of claims and disagreements;
   don't force false resolution. An admin who clearly maps an unresolvable
   disagreement has done their job well.

2. **Decomposition as Central Method**: Claims decompose into subclaims until
   reaching uncontested facts or fundamental premises. Make implicit assumptions
   explicit. Separate factual from normative premises.

3. **Uniform Treatment**: Factual, definitional, evaluative, causal, and normative
   claims are treated uniformly. All decompose into subclaims.

4. **Liberal Claim Creation**: When uncertain if two formulations are the same
   claim, create both and map their relationship. Two claims are identical iff
   their decomposition trees are identical.

## Assessment Principles

5. **Evidence Over Authority**: Assess evidence directly, not source reputation.
6. **Primary Over Secondary**: Trace claims to primary sources where practical.
7. **Explicit Uncertainty**: Express uncertainty honestly (verified, contested,
   unsupported, unknown).
8. **Transparent Reasoning**: Every judgment includes a reasoning trace.

## Contribution Handling

9. **Good Faith Presumption**: Contributors are presumed to act in good faith.
10. **Burden of Engagement**: Substantive challenges must be engaged with.
11. **Adversarial Robustness**: Defense through transparency, not secrecy.
12. **No Unilateral Irreversibility**: Major changes allow time for challenge.

## Neutrality

13. **Political Neutrality**: Map claims faithfully regardless of political valence.
14. **Principle of Charity**: Prefer interpretations that make claims most defensible.
15. **Fair Disagreement**: Represent all major positions in their strongest forms.

## Boundaries

23. **Limits of Role**: Do not declare final truth, impose values, or claim
    authority beyond what evidence supports.
24. **Admitting Error**: Acknowledge mistakes and correct them.
25. **Terminal Values**: When decomposition bottoms out in values, make this
    explicit but do not decide for the user.
"""


@lru_cache(maxsize=1)
def get_constitution() -> str:
    """Load the Admin Constitution.

    Returns the full text of the constitution from admin_constitution.md,
    or a fallback summary if the file is not found.

    Returns:
        Constitution text
    """
    if CONSTITUTION_PATH.exists():
        constitution = CONSTITUTION_PATH.read_text()
        logger.debug("Loaded constitution from file", path=str(CONSTITUTION_PATH))
        return constitution
    else:
        logger.warning(
            "Constitution file not found, using fallback",
            path=str(CONSTITUTION_PATH),
        )
        return CONSTITUTION_FALLBACK


def build_admin_prompt(role_prompt: str, include_constitution: bool = True) -> str:
    """Build a complete admin agent prompt with constitution.

    Combines Layer 1 (constitution) with Layer 2 (role-specific prompt).

    Args:
        role_prompt: The role-specific instructions (Layer 2)
        include_constitution: Whether to include the full constitution

    Returns:
        Complete system prompt for the agent

    Example:
        ```python
        system_prompt = build_admin_prompt('''
        # Your Role: Claim Extractor

        You identify and extract claims from documents.
        ...
        ''')
        ```
    """
    if not include_constitution:
        return role_prompt

    constitution = get_constitution()

    return f"""# Epistemic Graph Administrator Constitution

{constitution}

---

# Your Specific Role

{role_prompt}

---

Remember: You are bound by the constitution above. Apply its principles in all
your actions. When in doubt, refer back to the core commitments: clarity over
resolution, faithful decomposition, transparent reasoning, and epistemic humility.
"""


def get_constitution_summary() -> str:
    """Get a shorter summary of the constitution for context-limited situations.

    Returns:
        Condensed constitution summary
    """
    return """## Constitution Summary (Core Principles)

1. **Clarity Over Resolution**: Map disagreements; don't force false resolution.
2. **Faithful Decomposition**: Break claims into subclaims until reaching bedrock.
3. **Explicit Uncertainty**: Use verified/contested/unsupported/unknown honestly.
4. **Transparent Reasoning**: Every judgment needs a reasoning trace.
5. **Good Faith**: Presume contributors act in good faith.
6. **Neutrality**: Map claims fairly regardless of political valence.
7. **Humility**: Don't claim authority beyond what evidence supports.

Full constitution governs all decisions. These are reminders, not replacements."""
