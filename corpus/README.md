# Corpus test harness

A small, pinned set of documents for testing and iterating on the claim agent
organization. A run drives the whole pipeline to a stable state — Extract →
Match → Decompose → Assess, plus the **stewardship propagation** those
assessments trigger — so you can see whether the agents fit together and settle
correctly as more overlapping claims are ingested. The focus is disambiguation,
canonicalization, related-claim handling, and propagation behavior.

**Not yet exercised:** community contributions, conflict review, escalation, and
arbitration. Those are driven by contributions submitted through the API, which a
corpus ingest doesn't generate — testing them needs a separate contributions
scenario (a planned follow-up). The harness drains those queues too, so they'll
run as soon as something enqueues them.

It runs against an **isolated database** (`episteme_corpus` by default), never
the main graph, so you can wipe and re-run freely.

## Layout

```
corpus/
  RUBRIC.md              qualitative review rubric, distilled from the constitution
  <cluster>/
    manifest.json        pinned LessWrong post IDs (source of truth, reproducible)
    expectations.json    minimal orienting notes (intentionally not an answer key)
    posts/<id>.md        clean markdown, committed so runs are reproducible offline
    posts/<id>.json      metadata sidecar (title, author, score, url, fetchedAt)
scripts/corpus/          fetch / reset / run / report (run via tsx)
runs/                    report.md + graph.json per run (gitignored)
```

Current cluster: **`lethalities`** — the 2022 "List of Lethalities" AI-risk
debate (Yudkowsky's anchor + direct responses + two sub-threads, 11 posts,
~85k words). Chosen for dense claim overlap and head-to-head disagreement.

## Prerequisites

- Postgres running (`docker compose up -d`).
- `.env` with `ANTHROPIC_API_KEY` (claims) and `OPENAI_API_KEY` (embeddings).
- Optionally set budget limits in `.env` (`LLM_DAILY_TOKEN_LIMIT`, etc.) — the
  pipeline's circuit breaker will stop a run cleanly when hit.

## Usage

```bash
# 1. Cache the posts (once; re-run only to refresh pinned content)
npm run corpus:fetch -- lethalities

# 2. Hit run — resets the corpus DB, ingests, writes a report
npm run corpus:run -- lethalities --limit=2      # cheap smoke test (2 posts)
npm run corpus:run -- lethalities                # full cluster

# Other entry points
npm run corpus:reset                             # wipe the corpus DB only
npm run corpus:report -- lethalities             # re-render a report from current DB state
```

`corpus:run` flags: `--limit=N`, `--posts=id1,id2`, `--no-reset` (ingest on top
of the existing graph instead of wiping first).

## Reading the results

Open the printed `runs/<cluster>-<timestamp>/report.md` and read it top to bottom
against [`RUBRIC.md`](./RUBRIC.md) — the report's sections cite the rubric
dimensions they serve. `graph.json` in the same folder is the machine-readable
dump for deeper digging.

## Cost & nondeterminism

- The full cluster is a real LLM workload (extraction over ~85k words, then
  recursive decomposition, assessment with web search, and a stewardship pass —
  each steward invocation is itself a multi-tool agent call). Start with
  `--limit=2` while iterating on prompts; run the full set less often.
- LLM output is nondeterministic. Treat a single run as one sample: run 2–3×
  and watch whether the metrics and failure modes are **stable**, not whether
  any one number matches.

## Notes for maintainers

- Locally there is no SQS and nothing drains the in-memory queues, so the
  harness calls the worker handlers directly. `driver.ts`'s `drainAll()` runs
  every local queue (claim-pipeline, steward, contribution, arbitration, audit)
  to quiescence, dispatching each message to its handler — so the full agent
  organization settles, not just ingestion. It has a safety cap to bound runaway
  propagation; the run log prints `CAPPED` if it's hit.
- The deeper fix this works around: `src/` has no local in-memory queue consumer
  (`poller.ts` is SQS-only, started only when `SQS_*` env is set). A shared
  local-queue runner in `src/` would let both a future `npm run dev` worker and
  this harness exercise the same drain path.
- `enqueueAudit` has no call site anywhere, so the audit agent never runs even in
  production — the harness drains the audit queue but it stays empty.
- The matcher retrieves candidates at cosine 0.8 (top-level, in
  `url-extraction.ts`) while subclaim matching uses
  `MATCHING_SIMILARITY_THRESHOLD` (0.85) with no LLM. These thresholds are the
  main disambiguation knobs. Note the asymmetry: only the subclaim threshold is
  env-configurable (`MATCHING_SIMILARITY_THRESHOLD`); the top-level 0.8 is
  hardcoded in `url-extraction.ts`, so changing it means editing that file.
