import { apiConfigured, fetchClaimDetail, fetchSearch, fetchList } from "./api";
import { getClaim, listClaims } from "./fixtures";
import type { ClaimDetail, ClaimFilters, SearchResultItem } from "./types";

// The same filter predicate the API applies, used for the fixture fallback so
// the controls behave identically offline. "unassessed" keys off a missing
// status, matching the badge rule and the backend's `a.status IS NULL`.
function applyFilters(items: SearchResultItem[], filters?: ClaimFilters): SearchResultItem[] {
  if (!filters) return items;
  return items.filter((c) => {
    if (filters.assessed === "assessed" && !c.assessment_status) return false;
    if (filters.assessed === "unassessed" && c.assessment_status) return false;
    if (filters.minImportance && (c.importance ?? 0) < filters.minImportance) return false;
    return true;
  });
}

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
  filters?: ClaimFilters,
): Promise<{ results: SearchResultItem[]; source: DataSource }> {
  if (!apiConfigured()) {
    return { results: applyFilters(listClaims(), filters), source: "fixture" };
  }
  try {
    // With a query, search by meaning; without one, browse the most recent.
    const results = query
      ? await fetchSearch(query, filters)
      : await fetchList(40, filters);
    return { results, source: "live" };
  } catch (err) {
    console.error("[episteme] live claim list failed, using fixture:", err);
    return { results: applyFilters(listClaims(), filters), source: "fixture" };
  }
}
