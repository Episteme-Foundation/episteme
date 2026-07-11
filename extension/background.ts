import { analyzePage, chat, getClaimDetail } from "~lib/api";
import type { BackgroundRequest, PageAnalysis, Result } from "~lib/types";

/**
 * Background service worker: the only place that talks to the Episteme API
 * (so the API key never enters page contexts), plus a per-worker analysis
 * cache and the toolbar badge.
 */

// url+content-hash → analysis. The server caches too; this just makes SPA
// back/forward and re-mounts instant. Hash arrives from the content script.
const analysisCache = new Map<string, PageAnalysis>();
const inFlight = new Map<string, Promise<PageAnalysis>>();
const CACHE_MAX = 50;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handleAnalyze(
  req: Extract<BackgroundRequest, { type: "analyze" }>
): Promise<PageAnalysis> {
  const key = `${req.url}\n${await sha256(req.content)}`;

  const hit = analysisCache.get(key);
  if (hit) return hit;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = analyzePage(req);
  inFlight.set(key, run);
  try {
    const analysis = await run;
    if (analysisCache.size >= CACHE_MAX) {
      const oldest = analysisCache.keys().next().value;
      if (oldest !== undefined) analysisCache.delete(oldest);
    }
    analysisCache.set(key, analysis);
    return analysis;
  } finally {
    inFlight.delete(key);
  }
}

function setBadge(tabId: number | undefined, count: number): void {
  if (tabId === undefined) return;
  void chrome.action.setBadgeBackgroundColor({ color: "#8c2f24" });
  void chrome.action.setBadgeText({
    tabId,
    text: count > 0 ? String(count) : "",
  });
}

chrome.runtime.onMessage.addListener(
  (message: BackgroundRequest, sender, sendResponse) => {
    const respond = (result: Result<unknown>) => sendResponse(result);

    (async () => {
      try {
        switch (message.type) {
          case "analyze":
            respond({ ok: true, data: await handleAnalyze(message) });
            break;
          case "chat":
            respond({ ok: true, data: await chat(message) });
            break;
          case "claim-detail":
            respond({ ok: true, data: await getClaimDetail(message.claimId) });
            break;
          case "badge":
            setBadge(sender.tab?.id, message.count);
            respond({ ok: true, data: null });
            break;
        }
      } catch (err) {
        respond({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    // Keep the message channel open for the async response.
    return true;
  }
);
