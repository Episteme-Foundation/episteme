# Episteme Architecture

This document describes the Episteme system **as it is built today**: the domain
model, the agent pipeline that populates it, and the data layer underneath. It is
a description of the running architecture, not a roadmap. Where a design decision
has interesting consequences, the reasoning is given inline.

The companion documents are the [constitution](/about/constitution) — the text
every administrator agent is bound by — and the operational policies further down
this page, which translate the constitution into concrete rules for each agent.

---

## System Overview

Episteme turns documents into a queryable graph of claims. Ingestion is the
expensive, write-side work: an LLM pipeline reads a source, pulls out atomic
claims, decides whether each is new, decomposes it into its supporting structure,
and assesses its validity. Serving is the cheap, read-side work: the graph that
results is queried directly, with no LLM in the request path.

```
   SOURCE              INGESTION              GRAPH
 ┌────────┐   ┌──────────────────────────┐   ┌──────────┐
 │ URL or │──▶│ Extractor → Matcher →     │──▶│ Postgres │
 │ document│   │ onboard → Claim Steward  │   │ +pgvector│
 └────────┘   └──────────────────────────┘   └────┬─────┘
                                                   │
   GOVERNANCE (ongoing)                            │ read
 ┌─────────────────────────────────────┐           ▼
 │ Claim Steward (decompose + assess) · │      ┌──────────┐
 │ Curator · Contribution Reviewer ·    │◀────▶│   API    │──▶ web / extension
 │ Dispute Arbitrator · Audit Agent     │      └──────────┘
 └─────────────────────────────────────┘
```

The work is done once, during ingestion, and reused everywhere a claim recurs —
the same claim appears across thousands of documents, but is decomposed and
assessed a single time. The processing agents run as queue-driven background
workers; the governance agents run continuously as contributions arrive and as
claims change.

The stack is TypeScript end to end: a Fastify API, background workers driven by a
job queue (AWS SQS in production, an in-memory runner locally), PostgreSQL with
the `pgvector` and full-text extensions as the single store, and Anthropic Claude
models behind every agent (the client calls the Anthropic Messages API directly;
model ids are centralized in `src/llm/models.ts`).

---

## The Domain Model

Six entities carry the epistemic content; the rest of the schema records
governance (contributions, reviews, appeals, arbitration, contributors) and
operations (sources, jobs). The epistemic core:

In the sketch below, `──<` reads "has many":

```
  Source ──< Instance >── Claim ──< Relationship >── Claim
                            │           (decomposition edge;
                            │            argument_id groups edges
                            │            into a line of reasoning)
                            ├──< Assessment   (verdict history; one is_current)
                            │
                            └──< Argument      (a named line of reasoning;
                                                relationship edges point back
                                                to it via argument_id)
```

### Claims

A **claim** is the atomic unit: a proposition that can be true or false. Empirical,
definitional, evaluative, causal, and normative claims are all represented the same
way and all decompose into subclaims. Two formulations are the *same* claim if and
only if they decompose identically — this is the basis for deduplication.

Each claim carries its canonical `text`, a `claim_type`, a lifecycle `state`
(active, merged, …), a `decomposition_status`, counters for how many children have
been assessed, an `embedding` (a 1536-dimension vector) and a generated
`text_search` column for retrieval. A claim that is merged into another records the
target in `merged_into` rather than being deleted.

### Arguments

An **argument** groups decomposition edges into a coherent, named line of reasoning.
A single claim routinely has several:

- **Philosophy** — "God exists" has the cosmological argument, the teleological
  argument, the argument from evil, and others.
- **Policy** — "We should raise the minimum wage" has a poverty-reduction argument
  (for) and an unemployment argument (against).
- **Science** — "The universe is ~13.8 billion years old" is supported independently
  by the CMB, stellar evolution, and nucleosynthesis.

Forcing these into one flat set of edges would lose the structure of which subclaim
belongs to which line of reasoning. An argument has a `stance` (`for`, `against`,
`neutral`), an optional `name` and `description`, its `content`, any `evidence_urls`,
and provenance (`created_by`, `created_at`).

Two design decisions follow:

- **Arguments are structural, not epistemic.** An argument has no validity status of
  its own. "Is this argument sound?" is itself a claim in the graph, not a field on
  the argument — so all epistemic weight stays in the claim layer.
- **Arguments are optional and non-exhaustive.** A claim with one natural
  decomposition needs no explicitly named argument; edges simply carry a null
  `argument_id`. Admins create arguments when a line of reasoning is live in the
  discourse, not preemptively.

When the *validity of an argument's framework* is itself disputed, "this framework is
valid" is added as a subclaim within that argument — typically with a `presupposes`
relation — keeping meta-disputes inside the claim layer with no special machinery.

### Decomposition edges

Decomposition is recorded as **claim relationships**: directed edges from a parent
claim to a child claim. Each edge has a `relation_type`, a free-text `reasoning`, a
`confidence`, and an optional `argument_id` linking it to the argument it belongs to.
A child can appear under multiple arguments (shared subclaims), and a uniqueness
constraint prevents duplicate parent/child/relation triples. The relation types are:

| Relation | Meaning |
|----------|---------|
| `requires` | The parent's truth depends on the child being true. |
| `supports` | The child provides evidence for the parent. |
| `contradicts` | The child weighs against the parent. |
| `specifies` | The child narrows or makes precise part of the parent. |
| `defines` | The child fixes the meaning of a term in the parent. |
| `presupposes` | The parent assumes the child (often a framework claim). |

### Assessments

An **assessment** is a verdict on a claim at a point in time: a `status`, a
`confidence`, and a `reasoning_trace` that documents how the evidence and
decomposition were weighed. Assessments are append-only history — exactly one row per
claim is flagged `is_current`. Each assessment also stores a `subclaim_summary` and
the `trigger` (and `trigger_context`) that prompted it, so the timeline of *why* a
claim's status changed is fully recoverable. The six statuses and how they propagate
are described under [Assessment](#assessment) below.

### Instances and sources

A **source** is a retrieved document (URL, title, content hash, raw content, type). An
**instance** links a canonical claim to one place it actually appeared: the exact
`original_text` quote, the surrounding `context`, a brief `summary_context` describing
the circumstances ("said during a Senate hearing on banking regulation, in response to
questioning about derivatives oversight"), and a `confidence` that the quote really
expresses the canonical claim. Instances are how a single canonical claim accumulates
provenance from many documents.

### Contributions and governance

Anyone can contribute. A **contribution** targets a claim with a type — `challenge`,
`support`, `propose_merge`, `propose_split`, `propose_edit`, `add_instance`, or
`propose_argument` — plus content and evidence. Contributions flow through review
(`contribution_reviews`), can be appealed (`appeals`), and escalated to arbitration
(`arbitration_results`). **Contributors** carry a
reputation score and acceptance history. This is the machinery the governance agents
operate; the rules they apply live in the operational policies below.

---

## Assessment

### The six statuses

Validity is expressed honestly, never as a binary. The system implements all six
statuses the constitution defines:

| Status | Meaning |
|--------|---------|
| `verified` | Traces to reliable primary sources through a clear evidence chain. |
| `supported` | Evidence favors the claim, but the chain is incomplete or sources are secondary. |
| `contested` | Credible evidence or argument exists on multiple sides. |
| `unsupported` | No credible evidence found, though the claim is not contradicted. |
| `contradicted` | Available evidence actively weighs against the claim. |
| `unknown` | Insufficient information to assess. |

The colour treatment in the UI is deliberately muted and never a traffic light:
`supported` and `verified` are distinct shades of green, `contested` is amber,
`contradicted` is a clay red, and the rest are warm neutrals — meaning never depends
on colour alone.

### Judgment-based propagation

Assessment is a holistic judgment by the claim's admin, **not** a mechanical roll-up
of child statuses. An earlier design used hard aggregation rules ("if any required
subclaim is `contested`, the parent is `contested`"). At scale that makes contestation
infectious — almost every claim eventually inherits a contested subclaim somewhere deep
in its tree, and the status field becomes useless.

Instead, the claim steward weighs the status of subclaims across all arguments, the
*materiality* of each subclaim to the parent's truth, and the strength of each
argument as a whole, and documents the result in its reasoning trace. The claim-steward
prompt gives guidance and worked examples rather than rules, and is explicit: *do not
mechanically propagate status changes — assess materiality first.*

Propagation is therefore self-limiting. When a subclaim's assessment changes, the
admins of directly dependent claims reconsider; most changes are absorbed within a
level or two, because a superior claim is rarely the right locus for a dispute about
one of its subclaims.

---

## The Agent Pipeline

Each agent is a Claude model with a system prompt assembled from two layers: the full
constitution, followed by the agent's specific role. The prompts live in
`src/llm/prompts/` and are vendored verbatim into this site (see the
[agents](/about/agents) page).

### Processing skills

Ingestion uses two stateless skills — called as functions, returning a result the
caller needs to proceed:

```
 Extractor ──▶ Matcher ──▶ onboard ──▶ Claim Steward
  read a       new claim     create     decompose + assess
  source for   or existing?   the node   (a governance agent,
  its claims  (agentic search           below)
              over the graph)
```

- **Extractor** — reads a source for the discrete, reusable claims it asserts, in
  canonical form.
- **Matcher** — the single decider of claim identity: for any proposition it searches
  the graph itself (multiple framings, including the negation — a claim and its denial
  are one node) and decides match-or-create. It is also a **tool** the Steward and
  Curator call before creating anything. Two claims match iff they decompose alike.

Decomposition and assessment are **not** separate processing agents: they are the Claim
Steward's job (a governance agent), because deciding what a claim depends on and whether
those dependencies hold is one open-ended judgment that belongs to the claim's owner.

### Governance agents

These are queue-triggered correspondents that act through tools over the life of a
claim and the graph:

- **Claim Steward** — owns a single claim end to end: it **decomposes** the claim
  (calling the Matcher to link existing claims rather than duplicate), maintains its
  canonical form and arguments, and **assesses** it, re-judging as evidence and
  depended-on claims change. Its effort scales with the claim's importance.
- **Curator** — the graph-level counterpart: it owns the connective tissue *between*
  claims — merging duplicates and counterparts the Matcher missed, splitting conflated
  claims (§18), and suggesting cross-claim edges for the owning Stewards to adopt. It
  never overrides a Steward's verdict.
- **Contribution Reviewer** — evaluates each incoming contribution against policy
  (accept, reject, or escalate), including `propose_argument` contributions.
- **Dispute Arbitrator** — resolves escalations and appeals through careful
  adjudication, the highest-stakes governance call (so it runs on Opus 4.8).
- **Audit Agent** — quality control over the governance system itself: samples
  decisions, adjusts reputation, and can suspend bad actors.

---

## Persistence

### PostgreSQL, not a graph database

The graph is stored relationally in **PostgreSQL**, accessed through Drizzle ORM — not
in a dedicated graph database. Claims are rows; decomposition is an adjacency table
(`claim_relationships`) whose `argument_id` column attaches each edge to its line of
reasoning; arguments, assessments, instances and sources are their own tables. A
relational store keyed by foreign keys is more than adequate for the tree-shaped reads
the product needs, and it lets the same engine carry vector search and full-text search
without a second system to operate.

Tree-building (`src/services/tree-service.ts`) walks the relationship table and carries
each edge's `argument_id`, `argument_name`, and `argument_stance` onto the node, so a
client can group a claim's children by argument for display.

### Schema at a glance

```
claims ──< claim_relationships >── claims     (parent / child adjacency)
  │              │
  │              └── argument_id ─▶ arguments ──▶ claims
  ├──▶ assessments        (verdict history; one is_current per claim)
  ├──▶ claim_instances ──▶ sources   (provenance: quote + context)
  └──▶ contributions ──▶ contribution_reviews ──▶ appeals ──▶ arbitration_results
                              contributors ─┘
```

### Search: vectors and full text

Postgres carries both retrieval paths the pipeline needs. Each claim has a 1536-dim
`embedding` (a `pgvector` column) for semantic neighbour search, and a generated
`tsvector` column for keyword search. The search service combines them into a hybrid
score (semantic similarity plus keyword and trigram matching), which is what the
Matcher uses to find candidate existing claims before making its final LLM judgment.

---

The operational policies that follow turn the constitution's principles into concrete,
per-agent rules — the acceptance criteria the Contribution Reviewer applies, the
assessment guidance the Claim Steward follows, and the reasoning-trace format every
agent emits.
