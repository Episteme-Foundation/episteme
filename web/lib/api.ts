import "server-only";
import type {
  ClaimDetail,
  ClaimFilters,
  ContributionDetail,
  ContributorProfile,
  LeaderboardContributor,
  SearchResultItem,
  TrajectoryPoint,
} from "./types";

// Server-only client for the Episteme Fastify API. The API key is read from the
// environment and attached here, on the server — it is never shipped to the
// browser. This module is the "BFF": React Server Components and route handlers
// call it; the browser never talks to the backend directly.

const BASE = process.env.EPISTEME_API_URL?.replace(/\/$/, "");
const KEY = process.env.EPISTEME_API_KEY;

export function apiConfigured(): boolean {
  return Boolean(BASE);
}

async function apiGet<T>(path: string): Promise<T> {
  if (!BASE) throw new Error("EPISTEME_API_URL is not set");
  const res = await fetch(`${BASE}${path}`, {
    headers: KEY ? { "x-api-key": KEY } : {},
    // The graph changes as claims are reassessed; revalidate on a short window.
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Episteme API ${res.status} ${res.statusText} for ${path}`);
  }
  return (await res.json()) as T;
}

interface TrajectoryResponse {
  current: TrajectoryPoint | null;
  history: TrajectoryPoint[];
  total_assessments: number;
  status_transitions: number;
}

export async function fetchClaimDetail(id: string): Promise<ClaimDetail> {
  // Detail (deep) and trajectory are separate endpoints; fetch in parallel.
  const [detail, trajectory] = await Promise.all([
    apiGet<ClaimDetail>(`/claims/${id}?information_depth=deep`),
    apiGet<TrajectoryResponse>(`/claims/${id}/assessments/trajectory`).catch(() => null),
  ]);
  return trajectory ? { ...detail, trajectory } : detail;
}

// Serialize the active filters into API query params. Defaults (all / 0) are
// omitted so the URL stays clean and matches the API's own defaults.
function filterParams(filters?: ClaimFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters?.assessed && filters.assessed !== "all") p.set("assessed", filters.assessed);
  if (filters?.minImportance && filters.minImportance > 0) {
    p.set("min_importance", String(filters.minImportance));
  }
  return p;
}

export async function fetchSearch(
  query: string,
  filters?: ClaimFilters,
): Promise<SearchResultItem[]> {
  const qs = filterParams(filters).toString();
  const r = await apiGet<{ results: SearchResultItem[]; total: number }>(
    `/claims/search/${encodeURIComponent(query)}${qs ? `?${qs}` : ""}`,
  );
  return r.results;
}

export async function fetchList(
  limit = 40,
  filters?: ClaimFilters,
): Promise<SearchResultItem[]> {
  const p = filterParams(filters);
  p.set("limit", String(limit));
  const r = await apiGet<{ results: SearchResultItem[]; total: number }>(
    `/claims?${p.toString()}`,
  );
  return r.results;
}

export async function fetchContribution(
  id: string,
): Promise<ContributionDetail | null> {
  try {
    // A contribution's status flips when its review lands; the default
    // 30-second window is fresh enough and keeps repeat reads cheap.
    return await apiGet<ContributionDetail>(`/contributions/${id}`);
  } catch {
    // 404 (unknown contribution) renders as not-found upstream.
    return null;
  }
}

export async function fetchLeaderboard(
  limit = 20,
): Promise<LeaderboardContributor[]> {
  const r = await apiGet<{ contributors: LeaderboardContributor[] }>(
    `/contributors?limit=${limit}`,
  );
  return r.contributors;
}

export async function fetchContributorProfile(
  id: string,
): Promise<ContributorProfile | null> {
  try {
    return await apiGet<ContributorProfile>(`/contributors/${id}`);
  } catch {
    // 404 (unknown contributor) renders as not-found upstream.
    return null;
  }
}
