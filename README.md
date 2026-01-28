# Episteme

**LLMs as Epistemic Infrastructure**

Episteme is a system that uses large language models to build and maintain a global knowledge graph of claims, providing transparent provenance, decomposition, and validity assessment for any factual assertion on the internet.

## The Problem

Current epistemic infrastructure is inadequate for the information age:

- **Wikipedia** is valuable but limited to encyclopedia entries. It can't contextualize claims as you encounter them on other websites, and its editors must rely on secondary sources rather than evaluating primary evidence directly.

- **Fact-checkers** are slow, have limited coverage, and are often politically contested. They can't scale to the volume of claims people encounter daily.

- **Readers have no easy way** to understand what a claim actually rests on, where the real disagreements lie, or whether an apparent dispute is actually about facts, definitions, or values.

- **Most disagreements are confused**. People think they're arguing about facts when they're actually using different definitions, or they think they disagree on values when they actually disagree about empirical consequences.

## The Vision

Deploy LLMs as epistemic infrastructure across the internet:

- **Browser extension** that color-codes claims by validity as you read any webpage
- **Click any claim** to see its provenance, decomposition into subclaims, and the full discourse around it
- **Pre-computed, not hallucinated** — claims are processed systematically by dedicated LLM agents, not generated ad-hoc in response to queries
- **Wikipedia-like openness** — anyone can contribute challenges, evidence, and improvements
- **Transparent LLM judgment** — all reasoning is logged and auditable, more scalable and potentially less biased than human-only systems

## Core Insight: Claims as Primitive

The system is built on a simple but powerful ontology:

**Claims** are the atomic unit. A claim is a proposition that can be true or false. "The Earth is approximately 4.5 billion years old" is a claim. "We should raise the minimum wage" is also a claim (a normative one).

**Two formulations are the same claim if they decompose identically.** This is the key insight for deduplication. "Inflation was high in 2022" and "prices rose significantly in 2022" might be the same claim or different claims depending on whether they decompose into the same subclaims.

**Every claim decomposes into subclaims** until hitting one of three types of bedrock:

1. **Verified facts** — "The Bureau of Labor Statistics reported CPI of 6.5% for 2022" — checkable against primary sources, no serious dispute
2. **Contested empirical questions** — Evidence exists but experts disagree on interpretation
3. **Fundamental value premises** — "Individual liberty matters more than collective welfare" — not resolvable by data, but can be made explicit

**The system's job is to make this structure visible**, not to adjudicate everything. When you see a claim like "the economy is doing well," the system shows you:
- What that claim actually depends on (GDP growth? unemployment? wage growth? inequality?)
- Which of those subclaims are settled vs contested
- Where disagreement is truly about values vs where it's about empirical facts that could in principle be resolved

## Why This Is Tractable

This might sound impossibly ambitious, but several factors make it feasible:

**The universe of claims is smaller than it seems.** There's enormous redundancy in what gets written. The same claims appear in thousands of articles. Once you've decomposed "inflation was high in 2022" once, that work applies everywhere the claim appears.

**LLMs are remarkably cheap.** Maintaining an LLM "admin" for millions of claims is economically viable. The hard work is done once during ingestion; serving queries against the built graph is inexpensive.

**Vector search + LLM judgment enables matching at scale.** When new text comes in, vector embeddings find the top candidate matches, then an LLM makes the final determination. This combines the speed of embedding search with the judgment quality of language models.

**LLMs can read primary sources.** Unlike Wikipedia editors who must rely on secondary sources (they can't personally replicate experiments or audit statistics), LLMs can actually examine primary data, statistical methodologies, and research papers directly.

## What Success Looks Like

Given any claim, the system produces:

- **Decomposition tree** — what subclaims this claim depends on
- **Assessment status** — verified, contested, unsupported, or unknown
- **Evidence links** — where each subclaim is supported or contradicted
- **Discourse history** — all contributions, challenges, and resolutions
- **Reasoning traces** — exactly why the system reached its conclusions

This is valuable whether the claim is "the Earth is 4.5 billion years old" (verified, based on radiometric dating that decomposes into well-established physics) or "we should close the border" (decomposes into contested empirical claims about effects plus explicit value premises about what matters).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATIONS                              │
│  Browser Extension  │  Claim Browser UI  │  API Consumers       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API LAYER                               │
│  Claims  │  Search  │  Contributions  │  Validation             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GOVERNANCE LAYER                            │
│  Claim Steward  │  Contribution Reviewer  │  Dispute Arbitrator │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PROCESSING LAYER                            │
│  Extractor  │  Matcher  │  Decomposer  │  Assessor              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       STORAGE LAYER                              │
│  Neo4j (Graph)  │  Pinecone (Vectors)  │  PostgreSQL (Documents)│
└─────────────────────────────────────────────────────────────────┘
```

### LLM Agents

The system uses specialized LLM agents for different tasks:

- **Extractor** — Identifies claims in documents
- **Matcher** — Determines if a claim matches an existing canonical form or is new
- **Decomposer** — Breaks claims into subclaims recursively
- **Assessor** — Evaluates claim validity based on its decomposition tree
- **Claim Steward** — Manages ongoing updates to individual claims
- **Contribution Reviewer** — Evaluates community contributions against policies
- **Dispute Arbitrator** — Handles escalated disputes with multi-model consensus
- **Audit Agent** — Reviews system decisions for quality and consistency

### Governance Model

Episteme follows Wikipedia-inspired principles adapted for LLM-native operation:

- **Anyone can contribute** — challenges, evidence, merge proposals
- **Transparent reasoning** — all agent decisions include full reasoning traces
- **Policy-based evaluation** — contributions are judged against explicit, documented policies
- **Multi-model consensus** — important decisions require agreement across multiple LLMs
- **Human escalation path** — truly contested issues can be flagged for human review

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | Python 3.12+ |
| API | FastAPI |
| Graph Database | Neo4j Aura |
| Vector Database | Pinecone |
| Document Store | PostgreSQL (AWS RDS) |
| Task Queue | Celery + Redis |
| LLM | Anthropic Claude |
| Frontend | React + TypeScript |
| Browser Extension | Plasmo |

## Project Status

This project is in early development. See the [implementation plan](/.claude/plans/) for current progress and roadmap.

## Contributing

Episteme is designed to be open to contributions, both to its codebase and (eventually) to its knowledge graph. Guidelines for contribution will be published as the project matures.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*"The owl of Minerva spreads its wings only with the falling of the dusk."* — Hegel

Episteme aims to change that. With LLMs as epistemic infrastructure, we can understand claims as they're made, not only in retrospect.
