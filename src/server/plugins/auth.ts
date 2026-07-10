import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { loadConfig } from "../../config.js";

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest("contributorExternalId", null);

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const config = loadConfig();

      // Skip auth in development if no keys configured. Act as a fixed local
      // contributor so contribution endpoints stay usable without keys.
      if (config.apiKeys.length === 0 || config.apiKeys[0] === "") {
        request.contributorExternalId = "dev-local";
        return;
      }

      const apiKey = request.headers["x-api-key"];
      if (!apiKey || !config.apiKeys.includes(apiKey as string)) {
        return reply.code(401).send({ error: "Invalid or missing API key" });
      }

      // The acting contributor is bound to the API key in config (issue #10);
      // an unbound key authenticates but carries no contributor identity.
      request.contributorExternalId =
        config.apiKeyContributors[apiKey as string] ?? null;
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
  interface FastifyRequest {
    contributorExternalId: string | null;
  }
}
