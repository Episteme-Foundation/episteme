import { getSettings } from "./settings";
import type {
  BackgroundRequest,
  ChatResponse,
  PageAnalysis,
} from "./types";

/**
 * Episteme API client. Runs in the background service worker only, so page
 * scripts never see the API key. Both agentic endpoints authenticate with the
 * user's API key and are metered per-token server-side (#70).
 */

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const settings = await getSettings();
  if (!settings.apiKey && !settings.apiBaseUrl.includes("localhost")) {
    throw new ApiError(
      "No API key configured. Create one in your Episteme dashboard and paste it in the extension settings.",
      401
    );
  }

  const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(settings.apiKey ? { "x-api-key": settings.apiKey } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const parsed = await res.json();
      detail = parsed?.error?.message ?? parsed?.error ?? detail;
      if (parsed?.code === "QUOTA_EXCEEDED") {
        detail =
          "Monthly free-tier allowance exhausted; it resets next month.";
      }
      if (res.status === 429) {
        detail = "Rate limited — try again in a little while.";
      }
    } catch {
      // non-JSON error body
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export function analyzePage(input: {
  url: string;
  title: string;
  content: string;
}): Promise<PageAnalysis> {
  return request<PageAnalysis>("/extension/analyze", input);
}

export function chat(
  input: Extract<BackgroundRequest, { type: "chat" }>
): Promise<ChatResponse> {
  return request<ChatResponse>("/extension/chat", {
    messages: input.messages,
    page: input.page,
  });
}

/** Free (non-agentic) read used by the click-through panel. */
export async function getClaimDetail(claimId: string): Promise<unknown> {
  const settings = await getSettings();
  const res = await fetch(
    `${settings.apiBaseUrl.replace(/\/$/, "")}/claims/${claimId}?information_depth=deep`
  );
  if (!res.ok) throw new ApiError(`Failed to load claim (${res.status})`, res.status);
  return res.json();
}
