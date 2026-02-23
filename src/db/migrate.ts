import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  await migrate(db, {
    migrationsFolder: new URL("./migrations", import.meta.url).pathname,
  });

  await pool.end();
}
