import "server-only";
import type { ClaimDetail, SearchResultItem, TrajectoryPoint } from "./types";

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

export async function fetchSearch(query: string): Promise<SearchResultItem[]> {
  const r = await apiGet<{ results: SearchResultItem[]; total: number }>(
    `/claims/search/${encodeURIComponent(query)}`,
  );
  return r.results;
}

export async function fetchList(limit = 40): Promise<SearchResultItem[]> {
  // The browse feed paginates via an opaque keyset cursor (next_cursor); we
  // currently surface only the first page. There is no `total` — a recency
  // feed deliberately doesn't count the full table.
  const r = await apiGet<{ results: SearchResultItem[]; next_cursor: string | null }>(
    `/claims?limit=${limit}`,
  );
  return r.results;
}
