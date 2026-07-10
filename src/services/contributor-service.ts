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

/**
 * Upsert an account from a sign-in (#70). Called by the web app (service
 * context) after the auth provider verifies the user. Keyed on externalId
 * ("<provider>:<subject>"); refreshes profile fields on every sign-in so a
 * changed display name or avatar propagates. Concurrent first sign-ins are
 * handled by the unique index + ON CONFLICT.
 */
export async function provisionUser(input: {
  externalId: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}) {
  const db = getDb();
  const [user] = await db
    .insert(contributors)
    .values({
      externalId: input.externalId,
      displayName: input.displayName,
      email: input.email ?? null,
      avatarUrl: input.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: contributors.externalId,
      set: {
        displayName: input.displayName,
        // Preserve an existing email/avatar if the provider stops sending one.
        ...(input.email ? { email: input.email } : {}),
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
        lastActiveAt: new Date(),
      },
    })
    .returning();
  return user!;
}
