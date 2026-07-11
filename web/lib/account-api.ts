import "server-only";

// Server-only client for the account/keys/usage half of the API (#70).
// Authenticates with the frontend's service key and acts on behalf of the
// signed-in user via x-acting-user. Nothing here ever reaches the browser.
//
// Account data must never be cached across users — every call is no-store
// (unlike the public claim reads in api.ts, which revalidate on a window).

const BASE = process.env.EPISTEME_API_URL?.replace(/\/$/, "");
const KEY = process.env.EPISTEME_API_KEY;

export function accountApiConfigured(): boolean {
  return Boolean(BASE);
}

class AccountApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}
export { AccountApiError };

async function accountFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    actingUser?: string;
  } = {}
): Promise<T> {
  if (!BASE) throw new Error("EPISTEME_API_URL is not set");
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(KEY ? { "x-api-key": KEY } : {}),
      ...(options.actingUser ? { "x-acting-user": options.actingUser } : {}),
      ...(options.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  });
  if (!res.ok) {
    let code: string | undefined;
    let message = `Episteme API ${res.status} for ${path}`;
    try {
      const payload = (await res.json()) as { error?: string; code?: string };
      code = payload.code;
      if (payload.error) message = payload.error;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new AccountApiError(message, res.status, code);
  }
  return (await res.json()) as T;
}

// --- shapes (the API speaks snake_case) -------------------------------------

export interface AccountUser {
  id: string;
  external_id: string | null;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  reputation_score: number;
  trust_level: string;
  kudos: number;
  contribution_standing: string;
  bad_faith_flags: number;
  contributions_accepted: number;
  contributions_rejected: number;
  contributions_escalated: number;
  is_verified: boolean;
  is_suspended: boolean;
  created_at: string;
  last_active_at: string;
}

export interface Entitlement {
  plan: string;
  monthly_grant_micro_usd: number;
  used_micro_usd: number;
  remaining_micro_usd: number;
}

export interface ApiKeyMeta {
  id: string;
  name: string;
  key_prefix: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface UsageBucket {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_micro_usd: number;
}

export interface UsageSummary {
  days: number;
  totals: UsageBucket;
  by_day: Array<{ date: string } & UsageBucket>;
  by_key: Array<
    { api_key_id: string | null; key_name: string | null } & UsageBucket
  >;
  by_agent: Array<{ agent: string } & UsageBucket>;
  entitlement: Entitlement;
}

// --- calls -------------------------------------------------------------------

export async function provisionUser(input: {
  externalId: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}): Promise<AccountUser> {
  const r = await accountFetch<{ user: AccountUser }>("/users/provision", {
    method: "POST",
    body: {
      external_id: input.externalId,
      display_name: input.displayName,
      ...(input.email ? { email: input.email } : {}),
      ...(input.avatarUrl ? { avatar_url: input.avatarUrl } : {}),
    },
  });
  return r.user;
}

export async function fetchAccount(
  externalId: string
): Promise<{ user: AccountUser; entitlement: Entitlement }> {
  return accountFetch("/users/me", { actingUser: externalId });
}

export async function fetchUsage(
  externalId: string,
  days = 30
): Promise<UsageSummary> {
  return accountFetch(`/usage?days=${days}`, { actingUser: externalId });
}

export async function listApiKeys(externalId: string): Promise<ApiKeyMeta[]> {
  const r = await accountFetch<{ keys: ApiKeyMeta[] }>("/api-keys", {
    actingUser: externalId,
  });
  return r.keys;
}

export async function createApiKey(
  externalId: string,
  name: string
): Promise<ApiKeyMeta & { key: string }> {
  return accountFetch("/api-keys", {
    method: "POST",
    body: { name },
    actingUser: externalId,
  });
}

export async function revokeApiKey(
  externalId: string,
  keyId: string
): Promise<void> {
  await accountFetch(`/api-keys/${keyId}`, {
    method: "DELETE",
    actingUser: externalId,
  });
}
