import { eq } from "drizzle-orm";
import { getDb, rawQuery } from "../db/client.js";
import { arguments_ } from "../db/schema.js";

/**
 * Inline claim reference inside an argument's written form:
 *   [[claim:<uuid>]]              — rendered as the claim's canonical text
 *   [[claim:<uuid>|inline text]]  — rendered as the given phrasing
 * Renderers resolve the id at display time (following merged_into), so links
 * never dangle after a merge.
 */
const CLAIM_LINK_PATTERN =
  /\[\[claim:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\|([^\]]*))?\]\]/g;

export interface ClaimLink {
  claimId: string;
  display: string | null;
}

/** Extract every [[claim:<uuid>]] / [[claim:<uuid>|text]] reference, in order. */
export function parseClaimLinks(writtenForm: string): ClaimLink[] {
  const links: ClaimLink[] = [];
  for (const m of writtenForm.matchAll(CLAIM_LINK_PATTERN)) {
    links.push({ claimId: m[1]!.toLowerCase(), display: m[2] ?? null });
  }
  return links;
}

/**
 * Does this argument's content carry a real written form? Steward-created
 * arguments start with their label copied into `content`; the written form
 * (issue #129) is distinguished by referencing its subclaims inline.
 */
export function hasWrittenForm(content: string): boolean {
  return parseClaimLinks(content).length > 0;
}

export async function addArgument(input: {
  claimId: string;
  stance: "for" | "against" | "neutral";
  content: string;
  name?: string;
  description?: string;
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
      name: input.name ?? null,
      description: input.description ?? null,
      evidenceUrls: input.evidenceUrls ?? [],
      createdBy: input.createdBy ?? "user",
    })
    .returning();

  return argument!;
}

export async function getArgument(argumentId: string) {
  const db = getDb();
  const [argument] = await db
    .select()
    .from(arguments_)
    .where(eq(arguments_.id, argumentId))
    .limit(1);
  return argument ?? null;
}

export async function getArgumentsForClaim(claimId: string) {
  const db = getDb();
  return db
    .select()
    .from(arguments_)
    .where(eq(arguments_.claimId, claimId));
}

/** The child claims attached to this argument's decomposition edges. */
export async function getArgumentSubclaims(
  argumentId: string
): Promise<{ id: string; text: string }[]> {
  return rawQuery<{ id: string; text: string }>(
    `SELECT c.id, c.text
       FROM claim_relationships cr
       JOIN claims c ON c.id = cr.child_claim_id
      WHERE cr.argument_id = $1`,
    [argumentId]
  );
}

/** Overwrite an argument's written form (its `content`). */
export async function setArgumentContent(argumentId: string, content: string) {
  const db = getDb();
  const [argument] = await db
    .update(arguments_)
    .set({ content })
    .where(eq(arguments_.id, argumentId))
    .returning();
  return argument ?? null;
}
