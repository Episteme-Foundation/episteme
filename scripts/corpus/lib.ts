/**
 * Shared setup for the corpus test harness.
 *
 * Importing this module has one critical side effect: it points DATABASE_URL at
 * an isolated corpus database so that resets and runs never touch the main
 * Episteme graph. This MUST run before any src/* code calls loadConfig() (which
 * caches on first read), so every corpus entry script imports this file first.
 */
import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../src/config.js";

loadDotenv(); // pull ANTHROPIC_API_KEY / OPENAI_API_KEY etc. from .env if present

// Dedicated, disposable database. Override with CORPUS_DATABASE_URL if you want
// to point somewhere else, but it must NOT be the main `episteme` database.
const DEFAULT_CORPUS_DB =
  "postgresql://episteme:episteme_dev@localhost:5432/episteme_corpus";
export const CORPUS_DATABASE_URL =
  process.env.CORPUS_DATABASE_URL ?? DEFAULT_CORPUS_DB;

// Force all downstream src/* code onto the corpus DB.
process.env.DATABASE_URL = CORPUS_DATABASE_URL;
// Never treat a corpus run as production (avoids the RDS SSL bundle requirement).
if (process.env.ENVIRONMENT === "production") {
  process.env.ENVIRONMENT = "development";
}
// Belt-and-suspenders: make sure we never accidentally drain to real SQS.
delete process.env.SQS_URL_EXTRACTION_QUEUE;
delete process.env.SQS_CLAIM_PIPELINE_QUEUE;

/**
 * Fail loudly if the DB the app actually resolved is not the isolated corpus DB.
 * This is the runtime backstop for the import-ordering contract above: if any
 * src module ever causes loadConfig() to cache before DATABASE_URL was pinned,
 * we abort here rather than silently writing to (or truncating) the main graph.
 * Call this before any destructive or write operation.
 */
export function assertCorpusDb(): void {
  const active = loadConfig().databaseUrl;
  if (active !== CORPUS_DATABASE_URL) {
    throw new Error(
      `Active database (${active}) is not the corpus DB (${CORPUS_DATABASE_URL}). ` +
        `Config was likely cached before lib.ts pinned DATABASE_URL — check import ordering.`
    );
  }
  if (new URL(active).pathname.replace(/^\//, "") === "episteme") {
    throw new Error("Refusing to operate on the main 'episteme' database.");
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..", "..");
export const CORPUS_ROOT = join(REPO_ROOT, "corpus");
export const RUNS_ROOT = join(REPO_ROOT, "runs");
export const MIGRATIONS_DIR = join(REPO_ROOT, "src", "db", "migrations");

export function clusterDir(name: string): string {
  return join(CORPUS_ROOT, name);
}
export function postsDir(name: string): string {
  return join(clusterDir(name), "posts");
}
export function manifestPath(name: string): string {
  return join(clusterDir(name), "manifest.json");
}
export function postMarkdownPath(name: string, id: string): string {
  return join(postsDir(name), `${id}.md`);
}
export function postSidecarPath(name: string, id: string): string {
  return join(postsDir(name), `${id}.json`);
}

export interface ManifestPost {
  id: string;
  slug: string;
  title: string;
  author: string;
  role?: string;
}
export interface Manifest {
  cluster: string;
  description: string;
  source: string;
  posts: ManifestPost[];
}

export function loadManifest(name: string): Manifest {
  return JSON.parse(readFileSync(manifestPath(name), "utf8")) as Manifest;
}

// --- tiny CLI helpers -------------------------------------------------------

/** Value of a `--name=value` flag, or undefined. */
export function argFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

/** Whether a bare `--name` flag is present. */
export function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

/** The i-th non-flag positional argument. */
export function positional(i: number): string | undefined {
  return process.argv.slice(2).filter((a) => !a.startsWith("--"))[i];
}
