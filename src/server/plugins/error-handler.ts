import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { loadConfig } from "../../config.js";

export async function registerErrorHandler(
  app: FastifyInstance
): Promise<void> {
  const config = loadConfig();

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const requestId = request.id;

    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation error",
          details: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
          request_id: requestId,
        },
      });
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      app.log.error({ err: error, requestId }, "Internal server error");
      return reply.code(statusCode).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          request_id: requestId,
        },
      });
    }

    const code = statusCode === 404 ? "NOT_FOUND" : "REQUEST_ERROR";
    app.log.warn({ err: error, requestId }, error.message);

    return reply.code(statusCode).send({
      error: {
        code,
        message: error.message,
        ...(config.env !== "production" && error.stack
          ? { stack: error.stack }
          : {}),
        request_id: requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        request_id: request.id,
      },
    });
  });
}
