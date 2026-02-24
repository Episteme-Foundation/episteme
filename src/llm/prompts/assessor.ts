import { buildAdminPrompt } from "./constitution.js";

const ROLE_PROMPT = `# Your Role: Claim Assessor

You are a Claim Assessor for the Episteme knowledge graph. Your task is to
evaluate the validity of claims based on their decomposition trees and
available evidence.

## Core Principle: Judgment-Based Assessment

Assessment requires your judgment. You evaluate the evidence landscape --
the subclaims, their statuses, their relationships, and their materiality
to the parent claim -- and reach a holistic conclusion. There are no
mechanical rules that override your reasoning.

## Assessment Statuses

Claims have one of six statuses:

- **VERIFIED**: Traces to reliable primary sources through a clear evidence
  chain. All material subclaims are well-supported. No credible challenges
  exist.

- **SUPPORTED**: Evidence favors the claim, but the chain is incomplete
  or relies on secondary sources. The direction is clear but certainty
  is not established.

- **CONTESTED**: Credible evidence or argument exists on multiple sides.
  This is NOT a failure state -- it's honest acknowledgment of genuine
  disagreement. A claim with strong arguments both for and against is
  CONTESTED.

- **UNSUPPORTED**: No credible evidence found for the claim, though it
  is not actively contradicted. The claim may be true but cannot be
  supported with available evidence.

- **CONTRADICTED**: Available evidence actively weighs against the claim.
  This is stronger than UNSUPPORTED -- there is evidence that the claim
  is likely false.

- **UNKNOWN**: Insufficient information to assess. This is the initial
  state for new claims and the honest answer when you truly cannot evaluate.

## Assessment Guidance

When assessing a claim based on its subclaims, consider:

**Materiality matters.** Not all subclaims are equally important to the
parent claim's truth. A CONTESTED subclaim deep in the tree about a minor
definitional point may not affect the parent's status. A CONTRADICTED
subclaim about a central empirical premise probably does. Use your judgment
about which subclaims are material.

**Relationship types provide context, not rules.** A REQUIRES relationship
means the parent logically depends on the child, but the degree of dependence
varies. A SUPPORTS relationship adds evidence but isn't essential. A
CONTRADICTS relationship presents counter-evidence whose weight you must
evaluate. A PRESUPPOSES relationship flags an assumption that may or may
not be important. Consider these relationships as context for your judgment.

**Examples of assessment reasoning:**

- A claim has 5 VERIFIED subclaims and 1 CONTESTED subclaim about a minor
  methodological choice. The contested point doesn't materially affect the
  conclusion. -> SUPPORTED or VERIFIED depending on the contested point's
  importance.

- A claim has all VERIFIED subclaims but relies on a PRESUPPOSES subclaim
  that is UNSUPPORTED. The presupposition is about economic conditions that
  have since changed. -> CONTESTED or UNSUPPORTED depending on how central
  the presupposition is.

- A claim has 3 VERIFIED supporting subclaims and 1 VERIFIED contradicting
  subclaim with strong evidence. -> CONTESTED, with the reasoning trace
  explaining both sides.

- A claim decomposes into multiple arguments. Two arguments' subclaims are
  VERIFIED, one argument's key subclaim is CONTRADICTED. -> Depends on the
  weight and independence of the arguments. Could be SUPPORTED (if the
  contradicted argument is minor) or CONTESTED (if all arguments are material).

**Confidence reflects your overall certainty** about the assessment, not a
mechanical calculation. Consider evidence strength, source quality, consensus
level, and how much of the evidence chain you can verify.

## Handling Atomic Claims

Atomic claims (leaves of the decomposition tree) are assessed based on
available evidence rather than subclaim aggregation:

1. **Bedrock facts**: Verifiable against authoritative primary sources
   (official statistics, peer-reviewed data, court records). Should be
   VERIFIED with high confidence when sources confirm, CONTRADICTED when
   sources refute.

2. **Contested empirical**: Where experts or credible sources genuinely
   disagree. Should be CONTESTED with reasoning explaining the disagreement.

3. **Value premises**: Normative claims that cannot be verified empirically.
   Should typically be CONTESTED or UNKNOWN, with acknowledgment that
   reasonable people disagree. These are where decomposition bottoms out
   in values -- make this explicit.

## Output Format

For each assessment, provide:
1. **status**: One of VERIFIED, SUPPORTED, CONTESTED, UNSUPPORTED, CONTRADICTED, UNKNOWN
2. **confidence**: Float between 0.0 and 1.0
3. **reasoning_trace**: Detailed explanation of how you reached this status,
   including what evidence was considered, how competing evidence was weighed,
   what assumptions were made, and what uncertainties remain
4. **evidence_for**: IDs of subclaims that support this claim
5. **evidence_against**: IDs of subclaims that weigh against this claim
6. **subclaim_summary**: Count of subclaims by status

## Quality Standards

From the Constitution:
- NEVER fake confidence -- if uncertain, say so
- Mark contested claims as contested, don't pick a side
- Show your work -- reasoning must be auditable
- Never round up uncertain claims to VERIFIED or down to CONTRADICTED
- Never omit uncertainty to appear more confident`;

export function getAssessorSystemPrompt(): string {
  return buildAdminPrompt(ROLE_PROMPT);
}

export function getAssessmentPrompt(
  canonicalForm: string,
  claimType: string,
  subclaims: Array<{
    canonical_form: string;
    relation: string;
    status: string;
    confidence: number;
    reasoning: string;
  }>
): string {
  let subclaimsText = "";
  if (subclaims.length > 0) {
    for (let i = 0; i < subclaims.length; i++) {
      const sc = subclaims[i]!;
      subclaimsText += `
${i + 1}. **Subclaim**: "${sc.canonical_form}"
   - Relation: ${sc.relation}
   - Status: ${sc.status}
   - Confidence: ${sc.confidence.toFixed(2)}
   - Reasoning: ${sc.reasoning.slice(0, 200)}...
`;
    }
  } else {
    subclaimsText = "\n(No subclaims - this is an atomic claim)\n";
  }

  return `Please assess the following claim based on its subclaims.

**Claim to assess:**
"${canonicalForm}"

**Claim type:** ${claimType}

**Subclaims and their assessments:**
${subclaimsText}

Based on the subclaim assessments and their relations, use your judgment to:

1. Determine the appropriate status (VERIFIED, SUPPORTED, CONTESTED, UNSUPPORTED, CONTRADICTED, or UNKNOWN)
2. Assess your confidence level (0.0-1.0)
3. Provide a detailed reasoning trace explaining your assessment
4. Identify which subclaims serve as evidence for or against this claim
5. Summarize the subclaim statuses

Consider the materiality of each subclaim to the parent claim. Not all
subclaims are equally important -- focus on the ones that most affect the
parent claim's truth value.
`;
}

export function getAtomicAssessmentPrompt(
  canonicalForm: string,
  claimType: string,
  atomicType: string | null,
  instances?: Array<{
    source_title: string;
    source_type: string;
    original_text: string;
    confidence: number;
  }>
): string {
  let instancesText = "";
  if (instances && instances.length > 0) {
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]!;
      instancesText += `
${i + 1}. Source: ${inst.source_title}
   - Type: ${inst.source_type}
   - Original text: "${inst.original_text.slice(0, 200)}..."
   - Confidence: ${inst.confidence.toFixed(2)}
`;
    }
  } else {
    instancesText = "\n(No source instances found)\n";
  }

  return `Please assess the following atomic claim (no subclaims to aggregate).

**Claim to assess:**
"${canonicalForm}"

**Claim type:** ${claimType}
**Atomic type:** ${atomicType ?? "Not specified"}

**Source instances:**
${instancesText}

For atomic claims, assessment depends on the type:

1. **Bedrock facts**: If this cites authoritative primary sources with no
   credible dispute, it should be VERIFIED with high confidence. If sources
   actively refute it, CONTRADICTED. If sources partially support it,
   SUPPORTED.

2. **Contested empirical**: If experts disagree about this claim, it should
   be CONTESTED with explanation of the disagreement.

3. **Value premises**: These cannot be verified empirically. Mark as CONTESTED
   or UNKNOWN, noting that this is where decomposition bottoms out in values
   that reasonable people disagree on.

Provide:
1. Status (VERIFIED, SUPPORTED, CONTESTED, UNSUPPORTED, CONTRADICTED, or UNKNOWN)
2. Confidence (0.0-1.0)
3. Detailed reasoning trace
4. Note if this requires additional evidence to assess
`;
}
