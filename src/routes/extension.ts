/**
 * Browser-extension endpoints (issue #72).
 *
 * Both endpoints are agentic (extractor + matcher + extension agent), so they
 * authenticate with an API key and pass through the metered quota gate (#70).
 * The synchronous LLM work runs inside runWithUsageContext so every token is
 * attributed to the calling user/key.
 */
import type { FastifyInstance } from "fastify";
import {
  extensionAnalyzeBody,
  extensionChatBody,
} from "../schemas/extension.js";
import { analyzePage, chatAboutPage } from "../services/extension-service.js";
import { runWithUsageContext } from "../llm/usage-context.js";

export async function extensionRoutes(app: FastifyInstance): Promise<void> {
  // POST /extension/analyze
  app.post("/analyze", {
    schema: {
      tags: ["extension"],
      summary:
        "Analyze a web page: extract claims, match them to the graph, and " +
        "return markup annotations decided by the extension agent",
      body: {
        type: "object",
        required: ["url", "content"],
        properties: {
          url: { type: "string", format: "uri" },
          title: { type: "string" },
          content: {
            type: "string",
            description: "Readable page text (not raw HTML)",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            url: { type: "string" },
            content_hash: { type: "string" },
            cached: { type: "boolean" },
            annotations: { type: "array" },
            stats: { type: "object", additionalProperties: true },
            analyzed_at: { type: "string" },
          },
        },
      },
    },
    preHandler: [app.authenticate, app.requireAgenticQuota],
    handler: async (request, reply) => {
      const body = extensionAnalyzeBody.parse(request.body);

      const { analysis, cached } = await runWithUsageContext(
        {
          userId: request.auth?.userId ?? null,
          apiKeyId: request.auth?.apiKeyId ?? null,
          requestId: request.id,
        },
        () => analyzePage(body)
      );

      return reply.send({ ...analysis, cached });
    },
  });

  // POST /extension/chat
  app.post("/chat", {
    schema: {
      tags: ["extension"],
      summary:
        "Talk to the extension agent about the current page, grounded in " +
        "the claim graph",
      body: {
        type: "object",
        required: ["messages"],
        properties: {
          messages: { type: "array" },
          page: { type: "object", additionalProperties: true },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            reply: { type: "string" },
            citations: { type: "array" },
          },
        },
      },
    },
    preHandler: [app.authenticate, app.requireAgenticQuota],
    handler: async (request, reply) => {
      const body = extensionChatBody.parse(request.body);

      const result = await runWithUsageContext(
        {
          userId: request.auth?.userId ?? null,
          apiKeyId: request.auth?.apiKeyId ?? null,
          requestId: request.id,
        },
        () => chatAboutPage(body)
      );

      return reply.send(result);
    },
  });
}
