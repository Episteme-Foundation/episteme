import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export async function registerErrorHandler(
  app: FastifyInstance
): Promise<void> {
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Validation error",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const statusCode = error.statusCode ?? 500;
    const message =
      statusCode >= 500 ? "Internal server error" : error.message;

    app.log.error(error);

    return reply.code(statusCode).send({ error: message });
  });
}
