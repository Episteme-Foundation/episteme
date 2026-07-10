/**
 * Quota enforcement for agentic (LLM-backed) endpoints (#70).
 *
 * Free, non-agentic reads never pass through here. Agentic surfaces — source
 * ingestion, claim proposal, and future extension/chat endpoints — add the
 * `requireAgenticQuota` preHandler, which enforces:
 *
 *   1. A per-caller rate limit (in-memory sliding hour window) as a blunt
 *      backstop against runaway clients.
 *   2. The metered monthly grant via the billing seam: once a user's derived
 *      cost for the month exhausts the free-tier grant, requests return 402
 *      QUOTA_EXCEEDED — "credits not yet available" until Stripe lands.
 *
 * Service traffic with no acting user (operator env keys, internal jobs) is
 * exempt from the monthly grant — that work is attributed to the system — but
 * still rate-limited when it carries a key identity.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { loadConfig } from "../../config.js";
import { getBillingProvider } from "../../services/billing-service.js";

// callerKey → timestamps (ms) of requests within the last hour
const windows = new Map<string, number[]>();

function rateLimited(callerKey: string, limitPerHour: number): boolean {
  if (limitPerHour <= 0) return false;
  const now = Date.now();
  const cutoff = now - 3_600_000;
  const hits = (windows.get(callerKey) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limitPerHour) {
    windows.set(callerKey, hits);
    return true;
  }
  hits.push(now);
  windows.set(callerKey, hits);
  return false;
}

/** Test hook. */
export function resetRateLimiter(): void {
  windows.clear();
}

export async function registerQuota(app: FastifyInstance): Promise<void> {
  app.decorate(
    "requireAgenticQuota",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const config = loadConfig();
      const auth = request.auth;

      const callerKey =
        auth?.apiKeyId ?? auth?.userId ?? auth?.method ?? "anonymous";
      if (rateLimited(callerKey, config.agenticRateLimitPerHour)) {
        return reply.code(429).send({
          error: "Rate limit exceeded for agentic endpoints; retry later",
          code: "RATE_LIMITED",
        });
      }

      // Metered grant applies to user-attributed work. Trusted service
      // traffic without an acting user is system work and exempt.
      if (auth?.userId) {
        const { allowed, entitlement } = await getBillingProvider().checkSpend(
          auth.userId
        );
        if (!allowed) {
          return reply.code(402).send({
            error:
              "Monthly free-tier allowance for LLM-backed requests is exhausted. " +
              "Purchasing credits is not yet available; the allowance resets at " +
              "the start of next month.",
            code: "QUOTA_EXCEEDED",
            entitlement: {
              plan: entitlement.plan,
              monthly_grant_micro_usd: entitlement.monthlyGrantMicroUsd,
              used_micro_usd: entitlement.usedMicroUsd,
              remaining_micro_usd: entitlement.remainingMicroUsd,
            },
          });
        }
      }
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    requireAgenticQuota: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
