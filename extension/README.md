# Episteme browser extension

Reads the page you're reading against the [Episteme](https://episteme.wiki)
claim graph (issue #72). The pipeline: capture the page's readable text →
extract claims (Extractor) → match each against the graph (Matcher) → a
dedicated **extension agent** judges how each on-page phrasing relates to what
the graph knows and decides the markup. The same agent powers the popup chat,
grounded in the graph with claim citations.

## Markup behavior

Conservative by default, progressively disclosing:

- **Conservative (default)** — only claims the agent judges *egregiously
  misleading or wrong as written* get a red underline.
- **Moderate** — also marks contested claims (calmer, dotted).
- **Aggressive** — also oversimplified and noteworthy claims.
- **Hover** — compact card: canonical claim, graph status, one-line why.
- **Click** — full panel: decomposition into subclaims, evidence and
  arguments for/against, and a link to the claim's page on episteme.wiki.

Markup is non-destructive: highlights are overlay elements anchored to the
rendered text, re-anchored when the page mutates. The page's DOM text is never
rewritten.

Analysis is asynchronous (#93): big pages take minutes, so the API answers
202 + a content hash once its grace window passes and the extension polls
until the result is ready. Results are cached server-side by url + content
hash, so re-analyzing an unchanged page is instant.

## Privacy

Analyzing a page sends its readable text to the Episteme API for claim
extraction. Because of that, **nothing is sent automatically by default** —
you trigger analysis from the popup, or opt a site (or everything) into
automatic analysis in settings. Any site can be disabled entirely.

## Auth & metering

All analysis and chat calls authenticate with your Episteme API key (create
one in the dashboard) and are metered per token against your account's
monthly allowance (#70). Reading claim details is free and unmetered.

## Development

```bash
cd extension
npm install
npm run dev      # loads a dev build; point chrome://extensions at build/chrome-mv3-dev
npm run build    # production build in build/chrome-mv3-prod
```

Built with [Plasmo](https://www.plasmo.com/) (cross-browser MV3). Point the
extension at a local API by setting the API base URL in settings
(`http://localhost:3000`, the default — no API key needed against a keyless
dev server).
