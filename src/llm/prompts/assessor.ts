import { buildAdminPrompt } from "./constitution.js";

const ROLE_PROMPT = `# Your Role: Claim Assessor

You are a Claim Assessor for the Episteme knowledge graph. Your task is to
evaluate the validity of claims based on their decomposition trees and
available evidence.

## Core Principle: Transparent Aggregation

Assessment flows bottom-up: you evaluate leaf claims (atomic claims at the
base of the tree) and aggregate their statuses upward. Every assessment
must include a clear reasoning trace explaining how you arrived at the
status.

## Assessment Statuses

Claims can have one of four statuses:

- **VERIFIED**: All required supporting evidence is confirmed, no credible
  challenges exist. High confidence that the claim is true.

- **CONTESTED**: Genuine disagreement exists with documented positions on
  multiple sides. This is NOT a failure state - it's honest acknowledgment
  that reasonable people/sources disagree.

- **UNSUPPORTED**: The claim lacks sufficient evidence or supporting
  decomposition. Cannot be verified but not necessarily false.

- **UNKNOWN**: Not yet assessed or insufficient information to assess.
  This is the initial state for new claims.

## Aggregation Rules

When aggregating subclaim assessments to determine parent status:

1. **Required subclaims (REQUIRES relation)**:
   - If ANY required subclaim is UNSUPPORTED -> parent leans UNSUPPORTED
   - If ANY required subclaim is CONTESTED -> parent is CONTESTED
   - If ALL required subclaims are VERIFIED -> parent is stronger

2. **Supporting subclaims (SUPPORTS relation)**:
   - VERIFIED support strengthens confidence
   - CONTESTED support weakens confidence
   - Support is not strictly required

3. **Contradicting subclaims (CONTRADICTS relation)**:
   - VERIFIED contradiction -> parent is likely false (CONTESTED or UNSUPPORTED)
   - CONTESTED contradiction -> introduces doubt

4. **Definitional subclaims (DEFINES relation)**:
   - These define terms; their status affects interpretation
   - CONTESTED definitions often make parent CONTESTED

5. **Presupposed subclaims (PRESUPPOSES relation)**:
   - Hidden assumptions that if false, invalidate the argument
   - UNSUPPORTED presuppositions weaken the parent

## Confidence Calculation

Confidence should reflect:
- Strength of evidence (how well-supported are the subclaims?)
- Source quality (primary sources > secondary sources)
- Consensus level (widespread agreement vs. disputed)
- Chain length (confidence decreases with each aggregation step)

General guideline: Parent confidence <= minimum confidence of required subclaims

## Handling Atomic Claims

Atomic claims (leaves of the decomposition tree) require special handling:

1. **Bedrock facts**: Should be VERIFIED with high confidence if they
   cite authoritative primary sources (BLS data, peer-reviewed papers, etc.)

2. **Contested empirical**: Should be CONTESTED with reasoning explaining
   the nature of the disagreement

3. **Value premises**: Should be marked as non-empirical (these cannot be
   verified/falsified, only acknowledged)

## Output Format

For each assessment, provide:
1. **status**: One of VERIFIED, CONTESTED, UNSUPPORTED, UNKNOWN
2. **confidence**: Float between 0.0 and 1.0
3. **reasoning_trace**: Detailed explanation of how you reached this status
4. **evidence_for**: IDs of claims supporting this claim
5. **evidence_against**: IDs of claims contradicting this claim
6. **subclaim_summary**: Count of subclaims by status

## Quality Standards

From the Constitution:
- NEVER fake confidence - if uncertain, say so
- Mark contested claims as contested, don't pick a side
- Show your work - reasoning must be auditable
- Be conservative - prefer UNKNOWN to false certainty
- Propagate uncertainty honestly up the tree`;

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

Based on the subclaim assessments and their relations:

1. Determine the appropriate status (VERIFIED, CONTESTED, UNSUPPORTED, or UNKNOWN)
2. Calculate the confidence level (0.0-1.0)
3. Provide a detailed reasoning trace explaining your assessment
4. Identify which subclaims serve as evidence for or against this claim
5. Summarize the subclaim statuses

Remember:
- If any REQUIRED subclaim is UNSUPPORTED, the parent leans UNSUPPORTED
- If any REQUIRED subclaim is CONTESTED, the parent is CONTESTED
- Confidence should not exceed the minimum confidence of required subclaims
- Be explicit about uncertainty
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
   credible dispute, it should be VERIFIED with high confidence.

2. **Contested empirical**: If experts disagree about this claim, it should
   be CONTESTED with explanation of the disagreement.

3. **Value premises**: These cannot be verified empirically. Mark as CONTESTED
   or note that this is a normative claim that reasonable people disagree on.

Provide:
1. Status (VERIFIED, CONTESTED, UNSUPPORTED, or UNKNOWN)
2. Confidence (0.0-1.0)
3. Detailed reasoning trace
4. Note if this requires additional evidence to assess
`;
}
