import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { arguments_ } from "../db/schema.js";

export async function addArgument(input: {
  claimId: string;
  stance: "for" | "against";
  content: string;
  evidenceUrls?: string[];
  createdBy?: string;
}) {
  const db = getDb();
  const [argument] = await db
    .insert(arguments_)
    .values({
      claimId: input.claimId,
      stance: input.stance,
      content: input.content,
      evidenceUrls: input.evidenceUrls ?? [],
      createdBy: input.createdBy ?? "user",
    })
    .returning();

  return argument!;
}

export async function getArgumentsForClaim(claimId: string) {
  const db = getDb();
  return db
    .select()
    .from(arguments_)
    .where(eq(arguments_.claimId, claimId));
}
