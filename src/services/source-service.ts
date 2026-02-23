import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sources } from "../db/schema.js";
import { createJob } from "./job-service.js";
import { enqueueUrlExtraction } from "./queue-service.js";

export async function submitSource(input: {
  url: string;
  title?: string;
  content?: string;
}) {
  const db = getDb();

  // Check for existing source with same URL
  const [existing] = await db
    .select()
    .from(sources)
    .where(eq(sources.url, input.url))
    .limit(1);

  if (existing) {
    // Re-process existing source
    const job = await createJob("url_extraction", {
      sourceId: existing.id,
      url: input.url,
    });

    await enqueueUrlExtraction({
      sourceId: existing.id,
      jobId: job.id,
      url: input.url,
    });

    return { sourceId: existing.id, jobId: job.id };
  }

  // Create new source
  const [source] = await db
    .insert(sources)
    .values({
      url: input.url,
      title: input.title ?? input.url,
      rawContent: input.content,
    })
    .returning();

  const job = await createJob("url_extraction", {
    sourceId: source!.id,
    url: input.url,
  });

  await enqueueUrlExtraction({
    sourceId: source!.id,
    jobId: job.id,
    url: input.url,
  });

  return { sourceId: source!.id, jobId: job.id };
}
