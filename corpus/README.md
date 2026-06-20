# Corpus test harness

A small, pinned set of documents for testing and iterating on the ingestion
pipeline (Extract → Match → Decompose → Assess), with a focus on whether
disambiguation, canonicalization, and related-claim handling hold up as more
overlapping claims are ingested.

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
  recursive decomposition and assessment, some with web search). Start with
  `--limit=2` while iterating on prompts; run the full set less often.
- LLM output is nondeterministic. Treat a single run as one sample: run 2–3×
  and watch whether the metrics and failure modes are **stable**, not whether
  any one number matches.

## Notes for maintainers

- Locally there is no SQS and nothing drains the in-memory queues, so the
  harness calls the worker handlers directly (`driver.ts`) instead of going
  through `POST /sources`.
- The matcher retrieves candidates at cosine 0.8 (top-level, in
  `url-extraction.ts`) while subclaim matching uses
  `MATCHING_SIMILARITY_THRESHOLD` (0.85) with no LLM. These thresholds are the
  main disambiguation knobs. Note the asymmetry: only the subclaim threshold is
  env-configurable (`MATCHING_SIMILARITY_THRESHOLD`); the top-level 0.8 is
  hardcoded in `url-extraction.ts`, so changing it means editing that file.
