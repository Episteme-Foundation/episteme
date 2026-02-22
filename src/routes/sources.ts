import type { FastifyInstance } from "fastify";
import { sourceSubmitBody } from "../schemas/source.js";
import { submitSource } from "../services/source-service.js";

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  // POST /sources
  app.post("/", {
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const body = sourceSubmitBody.parse(request.body);
      const result = await submitSource(body);

      return reply.code(202).send({
        source_id: result.sourceId,
        job_id: result.jobId,
        status: "queued" as const,
      });
    },
  });
}
