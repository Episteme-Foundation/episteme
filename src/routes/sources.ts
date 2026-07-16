import type { FastifyInstance } from "fastify";
import { sourceSubmitBody } from "../schemas/source.js";
import { submitSource } from "../services/source-service.js";

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  // POST /sources
  app.post("/", {
    schema: {
      tags: ["sources"],
      summary: "Submit a source URL for claim extraction",
      body: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
          title: { type: "string" },
          content: { type: "string" },
        },
      },
      response: {
        202: {
          type: "object",
          properties: {
            source_id: { type: "string", format: "uuid" },
            job_id: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["queued"] },
          },
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
    // Source ingestion mints live claims and instances with no review gate,
    // so until intake goes through the review pipeline it is restricted to
    // internal seeding (#157). It also drives the extractor + matcher (LLM
    // work), so it remains a metered agentic surface (#70).
    preHandler: [app.authenticate, app.requireDirectService, app.requireAgenticQuota],
    handler: async (request, reply) => {
      const body = sourceSubmitBody.parse(request.body);
      const result = await submitSource(body, {
        userId: request.auth?.userId ?? null,
        apiKeyId: request.auth?.apiKeyId ?? null,
      });

      return reply.code(202).send({
        source_id: result.sourceId,
        job_id: result.jobId,
        status: "queued" as const,
      });
    },
  });
}
