# Ingestion Review Rubric

A distillation of the [Admin Constitution](../admin_constitution.md), [Policies](../docs/policies.md),
and the agent prompts into a set of standards for judging what comes out of a corpus run.

**This rubric is a lens, not a checklist, and explicitly not exhaustive.** For the early iterations the
standard is qualitative judgment against the constitution, not pass/fail on specific claims. The dimensions
below are the *known* things to look at; the most valuable observations will often be failure modes nobody
anticipated. Section H exists to capture those. When a new failure mode recurs, promote it into a named
item here so the next reviewer looks for it.

Scope: the **ingestion path** that a corpus run exercises — Extract → Match → Decompose → Assess. It does
not cover contributions, arbitration, or stewardship (those aren't triggered by ingestion).

How to use it: read the run report top to bottom with these dimensions in mind. Each dimension gives the
**standard** (with citations), the **failure modes** to watch for, and **where in the report** to look.

---

## A. Extraction — what got pulled out of the document

**Standard.** Extract *all* substantive claims, faithfully and charitably, across every claim type.
Questions, commands, meta-text, pure definitions, and hedged non-assertions are not claims.
(Constitution §2, §3, §14; Policy 2, 3; Extractor prompt.)

**Failure modes.**
- **Under-extraction** — misses substantive claims, especially implicit assumptions and background factual
  claims the author treats as given. The Extractor is told to be thorough (§2); thin extraction from a
  dense post is a red flag.
- **Over-extraction** — pulls meta-text ("in this post I'll argue…"), rhetorical questions, or hedged
  non-assertions as if they were claims.
- **Type skew** — extracts only empirical claims and drops normative/evaluative/causal ones. This violates
  uniform treatment (§3) and quietly biases the whole graph toward "facts."
- **Fidelity loss** — `original_text` is paraphrased rather than an exact quote, breaking provenance (§17).
- **Granularity drift** — one claim shattered into fragments, or several distinct claims fused into one
  `original_text` span.

**Where to look.** The per-source extraction counts; the list of `original_text` → `proposed_canonical_form`
pairs for a couple of posts you've read.

---

## B. Canonical form quality — how claims were normalized

**Standard.** The canonical form makes every implicit parameter explicit (measure, time, place, threshold),
is self-contained, and preserves meaning. When a parameter is unknown, use a placeholder rather than
inventing one. (Constitution §16, §2; Policy 2; Extractor prompt.)

**Failure modes.**
- **Vague restatement** — canonical form just echoes the original ("AGI is dangerous" → "AGI is dangerous")
  with no parameters surfaced. This is the most common quiet failure, and it directly degrades matching.
- **Hallucinated specificity** — invents thresholds, dates, or numbers not in the source. Violates
  faithfulness; worse than vagueness because it's confidently wrong.
- **Context-stripping** — the canonical form is self-contained but lost the meaning by dropping essential
  context (e.g. which AI system, whose definition of "alignment").
- **Inconsistent canonicalization** — the same proposition is normalized differently in different documents.
  This is the upstream cause of most matching failures in C, so watch for it there too.

**Where to look.** The canonical forms in the per-claim listing; compare canonical forms of claims you
*know* are the same proposition across posts.

---

## C. Matching / canonicalization / dedup — **the core test**

This is the dimension the corpus is built to stress. **Note the two paths — they fail differently:**

- **Top-level claims** retrieve candidates by embedding (cosine ≥ 0.8) then a **Matcher LLM** decides
  match-vs-new with reasoning. (`url-extraction.ts`)
- **Subclaims** match by **embedding only** — top-1 above the threshold, **no LLM judgment**.
  (`claim-pipeline.ts`)

**Standard.** Two claims are the same iff they would decompose identically / have the same truth conditions.
When unsure, create both and map the relationship — liberal creation, rigorous mapping, conservative
merging. (Constitution §4, §16–18; Policy 4; Matcher prompt.)

**Failure modes.**
- **Over-merging (the worst failure).** Collapsing claims with different truth conditions into one canonical
  node — e.g. "AGI will kill everyone" merged with "AGI poses serious catastrophic risk," or a claim merged
  with its own negation. This silently *destroys the disagreement the system exists to surface*
  (§1 clarity, §15 fair representation, §16 individuation). The embedding-only subclaim path is especially
  exposed here, because negations and polar opposites sit close in vector space with no LLM to catch it.
- **Fragmentation / under-merging.** The same proposition, stated across several posts, ends up as multiple
  canonical claims because canonical forms diverged (see B) or embeddings fell below threshold. This defeats
  the core scaling premise that redundant claims collapse to one node (README). Watch the
  near-duplicate-canonical-pairs section.
- **Threshold artifacts.** Matches/non-matches that look arbitrary and would flip with a small change to the
  0.8 / 0.85 cutoffs. If a merge decision hinges on the threshold rather than the meaning, flag it.
- **Order sensitivity.** Matching is stateful — the first phrasing ingested becomes the canonical node and
  later phrasings attach to it. Check that the "winning" canonical form is a good one and not an artifact of
  which post happened to be processed first.
- **Relationship neglect.** When two top-level claims are correctly kept separate but are related
  (specification, contradiction), the ingestion path creates **no relationship** between them — only the
  decomposer makes edges. So related-but-distinct claims from different posts can sit as disconnected
  islands. That's "liberal creation" without the "rigorous mapping" half (§4). Note where it happens.

**Where to look.** Per-canonical-claim instance lists (what got collapsed, and whether it should have);
the near-duplicate-canonical-pairs section (fragmentation candidates); the Matcher reasoning traces for any
merge that surprises you.

---

## D. Decomposition — the dependency structure

**Standard.** *Neutral* decomposition: identify what a claim depends on, don't evaluate it. Decompose until
reaching genuine bedrock (bedrock fact / contested empirical / value premise). Surface definitional
subclaims (DEFINES) and hidden assumptions (PRESUPPOSES). Include both supporting and contradicting
dependencies. Group distinct lines of reasoning into named arguments; don't manufacture arguments for simple
claims. Don't add subclaims that aren't logically necessary. (Constitution §2; Policy 2; Decomposer prompt.)

**Failure modes.**
- **Shallow decomposition** — stops early, marks a clearly compound claim atomic.
- **Runaway / filler decomposition** — generates generic boilerplate subclaims, or keeps splitting until it
  hits the depth cap (`maxDecompositionDepth` = 5) without ever reaching real bedrock.
- **Evaluation leakage** — the decomposer judges validity instead of structure ("this subclaim is false…"),
  violating neutral decomposition.
- **Missing definitional / presupposition subclaims** — fails to surface what load-bearing terms mean
  ("aligned," "AGI," "sharp left turn"). These are exactly the hidden disagreements §2 wants exposed.
- **Argument structure misuse** — dumps everything into one default argument when distinct for/against lines
  exist, or invents named arguments for a simple claim.
- **Non-reconnecting subclaims** — subclaims phrased so idiosyncratically that the same underlying dependency
  never matches across parents, so no structure is shared (feeds into E).

**Where to look.** The decomposition trees; subclaim relation-type distribution; argument groupings; the
atomic_type tags on leaves.

---

## E. Cross-document graph structure — the scaling test

**Standard.** Redundancy should collapse and structure should be shared: claims that recur across posts
become one node, common dependencies become shared subclaims, and related/opposing positions are connected,
not siloed. The admin thinks at graph level — upstream, downstream, lateral. (README "why this is tractable";
Constitution §19, §21.)

**Failure modes.**
- **Per-document silos** — each post produces its own disconnected tree with no shared nodes, even where the
  posts plainly engage the same claims. The single strongest sign that scaling isn't working.
- **Shared-subclaim drought** — few or no subclaims with more than one parent across the corpus, despite
  heavy topical overlap.
- **Duplicate canonical nodes at scale** — the fragmentation from C, seen in aggregate.
- **Unrepresented contradiction** — posts that directly disagree (this corpus is built around a disagreement)
  produce no CONTRADICTS edges or contested structure linking the opposing claims.

**Where to look.** Shared-subclaim section; total canonical claims vs total instances (dedup ratio);
the cross-post relationship summary.

---

## F. Assessment — status and reasoning

Secondary for a disambiguation-focused run, but it runs, so sanity-check it.

**Standard.** Use the six statuses honestly (Verified, Supported, Contested, Unsupported, Contradicted,
Unknown); never round a genuinely contested claim up to verified or down to contradicted; every assessment
carries a substantive reasoning trace; assessment is holistic judgment, not mechanical aggregation.
(Constitution §1, §7, §8, §22; Policy 1, 7, 8; architecture-plan §3.)

**Failure modes.**
- **Status collapse** — nearly everything lands on one status (all `contested`, or all `unknown`).
- **False resolution** — a genuinely contested AI-risk claim marked `verified` / `contradicted` (§1).
- **Empty reasoning traces** — boilerplate or missing traces (violates §8); note that the pipeline swallows
  assessment errors silently, so a missing assessment is itself worth flagging.
- **Confidence miscalibration** — high confidence on claims the trace doesn't actually support.

**Where to look.** Status distribution; a few full reasoning traces; claims left with no current assessment.

---

## G. Cross-cutting properties

Applies to every stage above.

- **Faithfulness / no hallucination** — nothing in any canonical form, subclaim, or trace that isn't grounded
  in the source. The single most important cross-cutting check.
- **Neutrality (§13)** — this corpus is politically/ideologically loaded (AI risk). Are canonical forms and
  decompositions tilted toward either doom or dismissal? The framing should be even-handed.
- **Charity (§14)** — claims and arguments rendered in their strongest defensible form, not strawmanned.
- **Consistency (§21)** — similar claims treated similarly across the corpus (similar decomposition depth,
  similar canonicalization style, similar assessment).

---

## H. Field notes — emergent and unforeseen behaviors

**The point of this section.** The dimensions above are what we currently know to look for. The system will
do things we didn't predict. When you see behavior that feels wrong — even if it maps to none of A–G, even if
you can't yet articulate why — record it here. Don't force it into an existing category prematurely.

For each observation, note: what you saw, which run, and (if you can) a guess at which stage produced it.
When the same behavior shows up across runs, promote it to a named failure mode in the relevant section
above so it stops being a surprise.

> _(log observations below)_

- …
