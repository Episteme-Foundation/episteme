import type { FastifyInstance } from "fastify";
import { rawQuery } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
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
  });
}
