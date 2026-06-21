# Architecture Plan: Multi-Argument Model and Assessment Reforms

This document describes planned changes to the Episteme domain model and agent architecture, based on a review of how the system would handle millions of claims across diverse fields. The constitution and policies have already been updated to reflect these principles; this document specifies the implementation changes needed in the codebase (currently being refactored to TypeScript).

---

## 1. The Argument Entity

### Problem

The current architecture allows only one decomposition structure per claim. But claims routinely have multiple distinct lines of reasoning bearing on their truth:

- **Philosophy**: "God is real" has the cosmological argument, the teleological argument, the argument from evil, etc.
- **Policy**: "We should raise the minimum wage" has the poverty-reduction argument (for), the unemployment argument (against), etc.
- **Science**: "The universe is ~13.8 billion years old" is supported independently by CMB measurements, stellar evolution, and nucleosynthesis.
- **Causal disputes**: "The 2008 crisis was caused by deregulation" competes with the moral hazard explanation, the monetary policy explanation, etc.

Forcing these into a single flat set of decomposition edges loses the structure of which subclaims belong to which line of reasoning.

### Solution

Introduce an `Argument` entity that groups decomposition edges into coherent, named lines of reasoning.

```
Claim  ←──  Argument  ──→  [Decomposition edges to subclaims]
```

### Argument Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `claim_id` | UUID | The claim this argument bears on |
| `name` | string (optional) | Human-readable name, e.g., "The Cosmological Argument" |
| `direction` | enum: `for`, `against`, `neutral` | Whether this argument supports, opposes, or neutrally decomposes the claim |
| `description` | string (optional) | Brief description of the argument's approach or tradition |
| `created_at` | datetime | When this argument was created |
| `created_by` | string | Agent or contributor that created this argument |

### Key Design Decisions

- **Arguments are structural, not epistemic.** An Argument has no assessment status of its own. The question "is this argument sound?" is itself a claim in the graph, not a field on the Argument entity. This keeps all epistemic weight in the claim layer.
- **Arguments are optional for simple claims.** A claim with one natural decomposition does not need an explicitly named argument. Decomposition edges can belong to a default/unnamed argument, or the argument layer can be transparent.
- **Decomposition edges gain an `argument_id` field.** Each decomposition edge belongs to exactly one argument. Subclaims can appear in multiple arguments (shared across different lines of reasoning).
- **Arguments don't need to be exhaustive.** Not every argument a claim could have needs to exist in the graph. Admins create arguments when they're live in the discourse.

### Framework Disputes

When the validity of an argument's framework is itself disputed, the claim "this framework is valid" should be a subclaim within that argument, typically with a PRESUPPOSES relation. This keeps meta-disputes within the claim layer without requiring special machinery. The admin surfaces these meta-claims when they are part of active discourse, not preemptively.

### Impact on Existing Entities

| Entity | Change |
|--------|--------|
| `Claim` | No change. Claims remain atomic propositions. |
| `Decomposition` | Add `argument_id: UUID` field linking to the parent Argument. |
| `Assessment` | Reasoning traces should reference arguments by name where relevant. No structural change needed. |
| `Contribution` | Add `PROPOSE_ARGUMENT` contribution type for suggesting new arguments. Challenges can target specific arguments. |
| `ClaimTree` | Restructure to organize children by argument. |

### Graph Storage

In Neo4j, Arguments can be represented as nodes with `ARGUES_FOR` / `ARGUES_AGAINST` / `ARGUES_ABOUT` relationships to Claims. Decomposition edges (`DECOMPOSES_TO`) gain an `argument_id` property. Tree-building queries group subclaims by argument.

---

## 2. Assessment Status Alignment

### Problem

The constitution defines six assessment statuses (Verified, Supported, Contested, Unsupported, Contradicted, Unknown), but the `AssessmentStatus` enum only implements four (VERIFIED, CONTESTED, UNSUPPORTED, UNKNOWN). The missing statuses — SUPPORTED and CONTRADICTED — represent meaningful distinctions:

- **SUPPORTED**: Evidence favors the claim, but the chain is incomplete or sources are secondary. Distinct from VERIFIED (full primary-source chain) and CONTESTED (credible disagreement).
- **CONTRADICTED**: Available evidence actively weighs against the claim. Distinct from UNSUPPORTED (no evidence found) and CONTESTED (evidence on both sides).

### Solution

Add `SUPPORTED` and `CONTRADICTED` to the `AssessmentStatus` enum:

```
VERIFIED      — Traces to reliable primary sources through clear evidence chain
SUPPORTED     — Evidence favors the claim, but chain incomplete or sources secondary
CONTESTED     — Credible evidence/argument exists on multiple sides
UNSUPPORTED   — No credible evidence found, though not contradicted
CONTRADICTED  — Available evidence weighs against the claim
UNKNOWN       — Insufficient information to assess
```

---

## 3. Judgment-Based Assessment Propagation

### Problem

The current assessor prompt includes mechanical aggregation rules:

> "If ANY required subclaim is CONTESTED → parent is CONTESTED"

At scale, this makes contestation infectious — virtually every claim would converge to CONTESTED because somewhere deep in its decomposition tree, some subclaim is contested. The status field becomes useless.

### Solution

Remove all hard-coded aggregation rules. Assessment is a holistic judgment by the claim's admin, informed by:

- The status of subclaims across all arguments
- The materiality of each subclaim to the parent's truth
- The strength of each argument as a whole
- The admin's reasoning, documented in the reasoning trace

**Propagation model:**

1. When a subclaim's assessment changes, the admins of directly dependent claims are notified.
2. Each notified admin evaluates whether the change materially affects their claim.
3. If yes, they update their assessment with reasoning. If no, they note the change was considered and explain why no update is needed.
4. Propagation is self-limiting: most changes are absorbed within one or two levels, because superior claims are not the locus for disputes about their subclaims.

The assessor prompt should provide guidance and examples, not rules. For instance:

- "A claim whose required subclaims are all verified, with no credible challenges, is likely VERIFIED"
- "A claim with strong arguments both for and against is likely CONTESTED"
- "A contested subclaim deep in the tree may or may not affect the parent — use your judgment about materiality"

---

## 4. Instance Enrichment

### Problem

Instances currently link a canonical claim to a source document, but don't include enough context to understand how the claim appeared in the source.

### Solution

Ensure instances include:

- **`original_text`**: The exact quote where the claim was made (already exists)
- **`context`**: Surrounding text for disambiguation (already exists, ensure it's populated)
- **`summary_context`**: Brief summarized context explaining the circumstances (e.g., "Said during a Senate hearing on banking regulation, in response to questioning about derivatives oversight"). This is new.

This is a minor enrichment, not an architectural change. The existing `Instance` model's `context` and `metadata` fields can accommodate this without structural modification.

---

## 5. Summary of All Changes

### Constitution (`admin_constitution.md`) — DONE

- §2: Added "Multiple Arguments" subsection explaining that claims can have multiple distinct arguments
- §2: Added "Framework Disputes" subsection on handling meta-disputes as subclaims
- §4: Extended liberal creation principle to arguments
- §22: Replaced mechanical propagation with judgment-based propagation

### Policies (`docs/policies.md`) — DONE

- Policy 2: Added multiple arguments operational rules
- Policy 4: Extended to arguments
- Claim Steward: Added argument management responsibilities and assessment guidance
- Removed language implying mechanical status propagation

### Domain Model — TODO (in TypeScript refactor)

- New `Argument` entity
- `Decomposition` gains `argument_id` field
- `AssessmentStatus` gains `SUPPORTED` and `CONTRADICTED`
- `ContributionType` gains `PROPOSE_ARGUMENT`
- `Instance` gains optional `summary_context` field

### Agent Prompts — TODO (in TypeScript refactor)

- Decomposer: Decompose within arguments; create multiple arguments when appropriate
- Assessor: Remove mechanical aggregation rules; assess holistically across arguments
- Claim Steward: Manage arguments; exercise judgment on propagation
- Matcher: Consider argument-level matching when linking instances
- Contribution Reviewer: Handle `PROPOSE_ARGUMENT` contributions

### Graph Storage — TODO (in TypeScript refactor)

- Argument nodes in Neo4j with relationships to Claims
- `argument_id` property on `DECOMPOSES_TO` edges
- Tree-building queries restructured to group by argument
- Propagation queries notify directly dependent claim admins only
