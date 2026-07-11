/**
 * Request authentication (#70).
 *
 * Three ways a request can authenticate, tried in order:
 *
 *  1. DB-backed API key (x-api-key) — minted from the dashboard, stored
 *     hashed. Resolves to the owning user. scope='service' keys are trusted
 *     first-party keys (the web BFF) and may act ON BEHALF OF another user
 *     via the x-acting-user header (the dashboard session path).
 *
 *  2. Env-configured key (API_KEYS) — operator-provisioned bootstrap keys
 *     ("key" or "key:contributor_external_id" entries). Treated as service-
 *     trusted: they may also send x-acting-user. This is how the web
 *     frontend authenticates before any DB keys exist.
 *
 *  3. Dev bypass — only when NO keys are configured AND env != production:
 *     acts as the fixed "dev:local" identity with service trust so the whole
 *     dashboard flow works locally with zero setup. In production a missing
 *     API_KEYS now fails closed (401) instead of leaving writes open.
 *
 * The resolved identity is exposed as request.auth; the legacy
 * request.contributorExternalId is kept in sync for existing routes.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { loadConfig } from "../../config.js";
import { resolveApiKey } from "../../services/api-key-service.js";
import {
  getContributorByExternalId,
  getOrCreateContributor,
} from "../../services/contributor-service.js";

export type AuthMethod = "api_key" | "env_key" | "dev_bypass";

export interface RequestAuth {
  method: AuthMethod;
  /** Acting account id (contributors.id); null when no user identity applies. */
  userId: string | null;
  /** DB key used to authenticate, when method === "api_key". */
  apiKeyId: string | null;
  /** Acting identity's external auth subject ("<provider>:<subject>"). */
  contributorExternalId: string | null;
  /** True for service-scope DB keys, env keys, and the dev bypass. */
  isService: boolean;
  /**
   * True when a service caller is acting on behalf of a signed-in user
   * (x-acting-user) — the "dashboard session" trust level required to manage
   * API keys, so a leaked consumer key can never mint or revoke keys.
   */
  isSession: boolean;
}

export const DEV_EXTERNAL_ID = "dev:local";

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest("contributorExternalId", null);
  app.decorateRequest("auth", null);

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const config = loadConfig();
      const envKeysConfigured =
        config.apiKeys.length > 0 && config.apiKeys[0] !== "";
      const presented = request.headers["x-api-key"] as string | undefined;

      let auth: RequestAuth | null = null;

      if (presented) {
        // 1. DB-backed key
        const resolved = await resolveApiKey(presented);
        if (resolved) {
          if (resolved.user.isSuspended) {
            return reply.code(403).send({
              error: "Account suspended",
              code: "ACCOUNT_SUSPENDED",
            });
          }
          auth = {
            method: "api_key",
            userId: resolved.user.id,
            apiKeyId: resolved.key.id,
            contributorExternalId: resolved.user.externalId,
            isService: resolved.key.scope === "service",
            isSession: false,
          };
        } else if (envKeysConfigured && config.apiKeys.includes(presented)) {
          // 2. Env-configured operator key
          const boundExternalId =
            config.apiKeyContributors[presented] ?? null;
          auth = {
            method: "env_key",
            userId: null,
            apiKeyId: null,
            contributorExternalId: boundExternalId,
            isService: true,
            isSession: false,
          };
        } else {
          return reply
            .code(401)
            .send({ error: "Invalid or missing API key" });
        }
      } else if (!envKeysConfigured && config.env !== "production") {
        // 3. Dev bypass — keyless local development acts as a fixed local
        // account (created on first use) so the full dashboard flow — keys,
        // usage, provisioning — works with zero configuration.
        const devUser = await getOrCreateContributor({
          externalId: DEV_EXTERNAL_ID,
          displayName: "Local Developer",
        });
        auth = {
          method: "dev_bypass",
          userId: devUser.id,
          apiKeyId: null,
          contributorExternalId: DEV_EXTERNAL_ID,
          isService: true,
          isSession: false,
        };
      } else {
        return reply.code(401).send({ error: "Invalid or missing API key" });
      }

      // Act-on-behalf-of: only service-trusted callers may assert another
      // user's identity. This is how the web app's session reaches the API.
      const actingExternalId = request.headers["x-acting-user"] as
        | string
        | undefined;
      if (actingExternalId) {
        if (!auth.isService) {
          return reply.code(403).send({
            error: "This API key cannot act on behalf of a user",
            code: "ACTING_USER_FORBIDDEN",
          });
        }
        const actingUser = await getContributorByExternalId(actingExternalId);
        if (!actingUser) {
          return reply.code(401).send({
            error: "Unknown acting user (not provisioned)",
            code: "UNKNOWN_ACTING_USER",
          });
        }
        if (actingUser.isSuspended) {
          return reply
            .code(403)
            .send({ error: "Account suspended", code: "ACCOUNT_SUSPENDED" });
        }
        auth = {
          ...auth,
          userId: actingUser.id,
          contributorExternalId: actingUser.externalId,
          isSession: true,
        };
      }

      request.auth = auth;
      request.contributorExternalId = auth.contributorExternalId;
    }
  );

  // Route guard: trusted first-party callers only (env keys, service-scope
  // DB keys, dev bypass). Run AFTER app.authenticate.
  app.decorate(
    "requireService",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth?.isService) {
        return reply.code(403).send({
          error: "This endpoint requires a service-scoped key",
          code: "SERVICE_KEY_REQUIRED",
        });
      }
    }
  );

  // Route guard: a resolved user account (own key, bound env key resolved
  // upstream, or a session acting user). Run AFTER app.authenticate.
  app.decorate(
    "requireUser",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth?.userId) {
        return reply.code(403).send({
          error:
            "This endpoint requires a user identity (sign in, or use a key bound to your account)",
          code: "USER_IDENTITY_REQUIRED",
        });
      }
    }
  );

  // Route guard: dashboard-session trust — a service caller acting for a
  // signed-in user. API-key management requires this so a leaked consumer key
  // cannot mint new keys. Dev bypass counts as a session for local DX.
  app.decorate(
    "requireSession",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = request.auth;
      const devSession = auth?.method === "dev_bypass" && auth.userId !== null;
      if (!auth?.isSession && !devSession) {
        return reply.code(403).send({
          error:
            "This operation is only available from a signed-in session (the dashboard)",
          code: "SESSION_REQUIRED",
        });
      }
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireService: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireUser: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireSession: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
  interface FastifyRequest {
    contributorExternalId: string | null;
    auth: RequestAuth | null;
  }
}
