import "dotenv/config";
import { join } from "path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "./server/app.js";
import { loadConfig } from "./config.js";
import { getDb, closeDb } from "./db/client.js";

async function main() {
  const config = loadConfig();

  if (config.env === "production") {
    console.log("Running database migrations...");
    const db = getDb();
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await migrate(db, {
      migrationsFolder: join(process.cwd(), "drizzle-migrations"),
    });
    console.log("Migrations complete.");
  }

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
