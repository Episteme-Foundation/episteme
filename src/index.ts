import "dotenv/config";
import { buildApp } from "./server/app.js";
import { loadConfig } from "./config.js";
import { closeDb } from "./db/client.js";

async function main() {
  const config = loadConfig();
  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
