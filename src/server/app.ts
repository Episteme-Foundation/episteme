import Fastify from "fastify";
import { loadConfig } from "../config.js";
import { registerCors } from "./plugins/cors.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { healthRoutes } from "../routes/health.js";
import { claimRoutes } from "../routes/claims.js";
import { sourceRoutes } from "../routes/sources.js";
import { jobRoutes } from "../routes/jobs.js";

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.env === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } }
          : undefined,
    },
  });

  // Plugins
  await registerCors(app);
  await registerAuth(app);
  await registerErrorHandler(app);

  // Routes
  await app.register(healthRoutes);
  await app.register(claimRoutes, { prefix: "/claims" });
  await app.register(sourceRoutes, { prefix: "/sources" });
  await app.register(jobRoutes, { prefix: "/jobs" });

  return app;
}
