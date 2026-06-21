import { apiConfigured, fetchClaimDetail, fetchSearch, fetchList } from "./api";
import { getClaim, listClaims } from "./fixtures";
import type { ClaimDetail, SearchResultItem } from "./types";

// Single seam the pages call. When EPISTEME_API_URL is configured we serve live
// data; otherwise we fall back to the design fixtures, so the UI is always
// viewable. Live errors degrade to fixtures rather than crashing the page.

export type DataSource = "live" | "fixture";

export async function loadClaim(
  id: string,
): Promise<{ detail: ClaimDetail | null; source: DataSource }> {
  if (!apiConfigured()) return { detail: getClaim(id), source: "fixture" };
  try {
    return { detail: await fetchClaimDetail(id), source: "live" };
  } catch (err) {
    console.error("[episteme] live claim fetch failed, using fixture:", err);
    return { detail: getClaim(id), source: "fixture" };
  }
}

export async function loadClaims(
  query?: string,
): Promise<{ results: SearchResultItem[]; source: DataSource }> {
  if (!apiConfigured()) return { results: listClaims(), source: "fixture" };
  try {
    // With a query, search by meaning; without one, browse the most recent.
    const results = query ? await fetchSearch(query) : await fetchList();
    return { results, source: "live" };
  } catch (err) {
    console.error("[episteme] live claim list failed, using fixture:", err);
    return { results: listClaims(), source: "fixture" };
  }
}
