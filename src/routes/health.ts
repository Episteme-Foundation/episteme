import type { FastifyInstance } from "fastify";
import { rawQuery } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", {
    schema: {
      tags: ["health"],
      summary: "Health check",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["healthy", "degraded"] },
            version: { type: "string" },
            db: { type: "string", enum: ["connected", "disconnected"] },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      let dbStatus = "disconnected";
      try {
        await rawQuery("SELECT 1");
        dbStatus = "connected";
      } catch {
        // DB not reachable
      }

      return reply.send({
        status: dbStatus === "connected" ? "healthy" : "degraded",
        version: process.env.npm_package_version ?? "0.1.0",
        db: dbStatus,
      });
    },
  });
}
