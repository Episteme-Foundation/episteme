# Remote MCP server

Episteme exposes the claim graph as a **remote MCP server** (Model Context
Protocol over streamable HTTP), so any MCP client — Claude Code, Claude.ai /
Cowork, Cursor, ChatGPT — can query claims, inspect decompositions and
assessments, fact-check text, and submit contributions from an agentic
workflow (issue #73).

## Endpoint

```
POST https://<api-host>/mcp
```

Single stateless JSON-RPC endpoint (the current streamable-HTTP remote-MCP
transport). There is no SSE resumption stream and no session state: `GET` and
`DELETE` return 405. Locally the endpoint is `http://localhost:3000/mcp`.

## Authentication

Every call must authenticate with an Episteme **API key** (minted from the
account dashboard, see [accounts.md](accounts.md)), passed either way:

- `x-api-key: <key>` header, or
- `Authorization: Bearer <key>` — for hosted clients that only support a
  bearer token.

Every call is attributed to the key's owning account. OAuth with dynamic
client registration (the flow Claude.ai prefers for one-click connectors) is
a planned follow-up; bearer-token custom connectors work today.

In local development with no `API_KEYS` configured, requests fall back to the
dev-bypass identity like the REST API.

### Connecting from Claude Code

```bash
claude mcp add --transport http episteme https://<api-host>/mcp \
  --header "x-api-key: <your-key>"
```

### Connecting from Claude.ai / Cowork

Settings → Connectors → *Add custom connector* → URL
`https://<api-host>/mcp`, and supply the API key as a bearer token in the
connector's advanced/auth settings.

## Metering

Tool calls follow the same free-vs-metered split as the REST API (#70):

| Tier | Tools | Cost |
|------|-------|------|
| Free reads | `search_claims`, `get_claim`, `get_decomposition`, `get_contribution_status` | never metered |
| Agentic | `match_claim`, `extract_claims`, `assess_text` | LLM tokens metered per account; rate-limited and gated on the monthly free-tier grant (402 `QUOTA_EXCEEDED` when exhausted) |
| Writes | `submit_contribution` | free for good-faith contributors; goes through the contribution review pipeline and reputation rules (#71) — new/low-reputation accounts get a tighter hourly cap (`CONTRIBUTION_RATE_LIMITED`), and an account flagged for suspected bad faith is blocked with `DEPOSIT_REQUIRED` until the flag is appealed |

## Tools

- **`search_claims`** `{query, limit?, assessed?, min_importance?}` — hybrid
  vector + keyword search over canonical claims. Each result carries its
  current assessment status/confidence and an `episteme.wiki` page link.
- **`get_claim`** `{claim_id, include?: ["provenance"|"arguments"|"dependents"]}`
  — canonical form, current assessment (status, confidence, reasoning),
  source instances, arguments, dependents, page link.
- **`get_decomposition`** `{claim_id, max_depth?}` — the subclaim tree with
  per-node assessment status: contested-vs-settled structure at a glance.
- **`match_claim`** `{assertion, context?}` — run a free-text assertion
  through the Matcher agent → the canonical claim it states (or negates — see
  `stance`) plus its assessment, or `matched: false` for new/unknown.
- **`extract_claims`** `{text, source_type?, max_claims?}` — run text through
  the Extractor agent → discrete checkable claims with proposed canonical
  forms.
- **`assess_text`** `{text, max_claims?}` — the judgment surface: extract the
  passage's claims, match each into the graph, and return per-claim verdicts
  (`well_supported`/`disputed`/… from the graph's assessments, `unassessed`
  if matched but not yet assessed, `unknown` if the graph has no such claim).
  Verdicts come from pre-computed assessments, not model recollection. When
  `stance` is `"denies"`, the passage asserts the claim's negation, so the
  assessment applies inverted.
- **`submit_contribution`** `{claim_id, contribution_type, content,
  evidence_urls?, merge_target_claim_id?, proposed_canonical_form?}` — file a
  challenge / support / merge / split / edit / instance / argument. Requires
  a key bound to a contributor identity; enters the standard Contribution
  Reviewer pipeline and is subject to suspension and reputation policy (#71).
- **`get_contribution_status`** `{contribution_id}` — review decision,
  reasoning, and policy citations once the reviewer has ruled.

## Resources

- `claim://{claim_id}` — a canonical claim with assessment + decomposition
  tree, attachable as context.
- `claims://recent` — most recently updated claims.

## Prompts

- `fact_check_document(document)` — drive `assess_text` over a document and
  produce a grounded, cited report.
- `check_assertion(assertion)` — check one assertion via `match_claim` and
  explain its standing.

## Configuration

- `PUBLIC_WEB_BASE_URL` — base URL used for `page_url` links in tool results
  (default `https://episteme.wiki`).
- Quota knobs are shared with the REST API: `AGENTIC_RATE_LIMIT_PER_HOUR`,
  `FREE_TIER_MONTHLY_USD`.
