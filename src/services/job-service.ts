import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { jobs } from "../db/schema.js";

export async function createJob(type: string, input: Record<string, unknown>) {
  const db = getDb();
  const [job] = await db.insert(jobs).values({ type, input }).returning();
  return job!;
}

export async function getJobById(jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return job ?? null;
}

export async function updateJob(
  jobId: string,
  updates: {
    status?: string;
    result?: Record<string, unknown>;
    error?: string;
  }
) {
  const db = getDb();
  const [updated] = await db
    .update(jobs)
    .set({
      ...updates,
      ...(updates.status === "completed" || updates.status === "failed"
        ? { completedAt: new Date() }
        : {}),
    })
    .where(eq(jobs.id, jobId))
    .returning();
  return updated ?? null;
}
