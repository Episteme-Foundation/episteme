import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../config.js";

export async function registerCors(app: FastifyInstance): Promise<void> {
  const config = loadConfig();

  let origin: boolean | string[];
  if (config.env === "production" && config.corsOrigins) {
    origin = config.corsOrigins.split(",").map((o) => o.trim());
  } else {
    origin = true;
  }

  await app.register(cors, {
    origin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  });
}
