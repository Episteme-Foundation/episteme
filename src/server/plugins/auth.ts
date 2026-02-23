import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { loadConfig } from "../../config.js";

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const config = loadConfig();

      // Skip auth in development if no keys configured
      if (config.apiKeys.length === 0 || config.apiKeys[0] === "") return;

      const apiKey = request.headers["x-api-key"];
      if (!apiKey || !config.apiKeys.includes(apiKey as string)) {
        return reply.code(401).send({ error: "Invalid or missing API key" });
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
  }
}
