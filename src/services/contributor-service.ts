/**
 * Contributor service -- DB operations for contributors.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { contributors } from "../db/schema.js";

export async function getContributorById(id: string) {
  const db = getDb();
  const [contributor] = await db
    .select()
    .from(contributors)
    .where(eq(contributors.id, id))
    .limit(1);
  return contributor ?? null;
}

export async function getContributorByExternalId(externalId: string) {
  const db = getDb();
  const [contributor] = await db
    .select()
    .from(contributors)
    .where(eq(contributors.externalId, externalId))
    .limit(1);
  return contributor ?? null;
}

export async function getOrCreateContributor(input: {
  externalId: string;
  displayName: string;
}) {
  const existing = await getContributorByExternalId(input.externalId);
  if (existing) return existing;

  const db = getDb();
  const [contributor] = await db
    .insert(contributors)
    .values({
      externalId: input.externalId,
      displayName: input.displayName,
    })
    .returning();

  return contributor!;
}
