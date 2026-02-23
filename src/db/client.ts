import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { loadConfig } from "../config.js";

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (_pool) return _pool;
  const config = loadConfig();
  _pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return _pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/** Raw SQL query helper for complex queries not expressible in Drizzle */
export async function rawQuery<T>(
  queryText: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(queryText, params);
  return result.rows as T[];
}
