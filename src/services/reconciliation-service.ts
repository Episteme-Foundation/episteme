/**
 * Reconciliation operations: the data layer for the Curator's re-individuation
 * surgery (constitution §18). Merges combine two claims into one; splits break a
 * conflated claim apart. These mutate nodes, edges, and instances directly — that
 * is the operation — and are logged via mergedInto so they remain inspectable and
 * reversible. The Curator decides *whether* to merge/split and hands the result
 * off to the affected claims' Stewards; this module just performs the mechanics.
 */
import { getDb, rawQuery } from "../db/client.js";
import { claims, claimRelationships } from "../db/schema.js";
import { generateEmbedding } from "./embedding-service.js";

/**
 * Merge `loserId` into `survivorId`: move the loser's instances, arguments, and
 * edges onto the survivor, then mark the loser a merged alias of the survivor.
 *
 * `stanceRelation` is the Curator's judgment about the two nodes' direction:
 * - "same": the loser states the same proposition the same way.
 * - "opposed": the loser is the survivor's negation/counterpart. Then a source
 *   that affirmed the loser *denies* the survivor, and an argument *for* the loser
 *   is *against* the survivor — so moved instance/argument stances are flipped.
 *
 * The mechanics are deterministic; the semantic cleanup (canonical wording,
 * verifying the flipped arguments read correctly, re-assessing) is the survivor's
 * Steward's job, which the Curator triggers after calling this.
 */
export async function mergeClaims(input: {
  survivorId: string;
  loserId: string;
  stanceRelation: "same" | "opposed";
  reasoning: string;
}): Promise<{ merged: boolean; survivorId: string; loserId: string }> {
  const { survivorId, loserId, stanceRelation } = input;
  if (survivorId === loserId) {
    throw new Error("Cannot merge a claim into itself");
  }
  const opposed = stanceRelation === "opposed";

  // 1. Instances onto the survivor (flip affirm/deny if opposed).
  await rawQuery(
    `UPDATE claim_instances
        SET claim_id = $1,
            stance = CASE WHEN $3::boolean
              THEN (CASE stance WHEN 'affirms' THEN 'denies'
                                WHEN 'denies'  THEN 'affirms'
                                ELSE stance END)
              ELSE stance END
      WHERE claim_id = $2`,
    [survivorId, loserId, opposed]
  );

  // 2. Arguments onto the survivor (flip for/against if opposed; neutral stays).
  await rawQuery(
    `UPDATE arguments
        SET claim_id = $1,
            stance = CASE WHEN $3::boolean
              THEN (CASE stance WHEN 'for'     THEN 'against'
                                WHEN 'against' THEN 'for'
                                ELSE stance END)
              ELSE stance END
      WHERE claim_id = $2`,
    [survivorId, loserId, opposed]
  );

  // 3. Edges where the loser is the CHILD. First drop any that would become a
  //    self-edge or duplicate an existing survivor edge (the unique index would
  //    otherwise reject the UPDATE), then repoint the rest.
  await rawQuery(
    `DELETE FROM claim_relationships cr
      WHERE cr.child_claim_id = $2
        AND (cr.parent_claim_id = $1
             OR EXISTS (SELECT 1 FROM claim_relationships e
                          WHERE e.child_claim_id = $1
                            AND e.parent_claim_id = cr.parent_claim_id
                            AND e.relation_type = cr.relation_type))`,
    [survivorId, loserId]
  );
  await rawQuery(
    `UPDATE claim_relationships SET child_claim_id = $1 WHERE child_claim_id = $2`,
    [survivorId, loserId]
  );

  // 4. Edges where the loser is the PARENT (same dedupe).
  await rawQuery(
    `DELETE FROM claim_relationships cr
      WHERE cr.parent_claim_id = $2
        AND (cr.child_claim_id = $1
             OR EXISTS (SELECT 1 FROM claim_relationships e
                          WHERE e.parent_claim_id = $1
                            AND e.child_claim_id = cr.child_claim_id
                            AND e.relation_type = cr.relation_type))`,
    [survivorId, loserId]
  );
  await rawQuery(
    `UPDATE claim_relationships SET parent_claim_id = $1 WHERE parent_claim_id = $2`,
    [survivorId, loserId]
  );

  // 5. Mark the loser a merged alias pointing at the survivor. It is kept (not
  //    deleted) so the merge is inspectable and reversible; search excludes it via
  //    merged_into.
  await rawQuery(
    `UPDATE claims SET merged_into = $1, state = 'merged', updated_at = now() WHERE id = $2`,
    [survivorId, loserId]
  );

  return { merged: true, survivorId, loserId };
}

/**
 * Create a new claim node (embedded so it is dedup-able immediately). Used by the
 * Curator when splitting a conflated claim into a fresh one.
 */
export async function createClaim(input: {
  text: string;
  claimType?: string;
  createdBy?: string;
}): Promise<{ id: string }> {
  const db = getDb();
  let embedding: number[] | undefined;
  try {
    embedding = await generateEmbedding(input.text);
  } catch {
    // Continue without embedding
  }
  const [claim] = await db
    .insert(claims)
    .values({
      text: input.text,
      claimType: input.claimType ?? "empirical_derived",
      embedding: embedding ?? undefined,
      createdBy: input.createdBy ?? "curator",
    })
    .returning();
  return { id: claim!.id };
}

/** Add a relationship edge between two existing claims. Idempotent. */
export async function addRelationshipEdge(input: {
  parentId: string;
  childId: string;
  relationType: string;
  reasoning: string;
  confidence?: number;
  createdBy?: string;
}): Promise<{ added: boolean }> {
  if (input.parentId === input.childId) return { added: false };
  const db = getDb();
  try {
    await db.insert(claimRelationships).values({
      parentClaimId: input.parentId,
      childClaimId: input.childId,
      relationType: input.relationType.toLowerCase(),
      reasoning: input.reasoning,
      confidence: input.confidence ?? 1.0,
      createdBy: input.createdBy ?? "curator",
    });
    return { added: true };
  } catch {
    return { added: false }; // unique constraint — edge already exists
  }
}

/** Remove a relationship edge (all relation types between the pair, or one). */
export async function removeRelationshipEdge(input: {
  parentId: string;
  childId: string;
  relationType?: string;
}): Promise<{ removed: number }> {
  const rows = await rawQuery<{ id: string }>(
    `DELETE FROM claim_relationships
      WHERE parent_claim_id = $1 AND child_claim_id = $2
      ${input.relationType ? "AND relation_type = $3" : ""}
      RETURNING id`,
    input.relationType
      ? [input.parentId, input.childId, input.relationType.toLowerCase()]
      : [input.parentId, input.childId]
  );
  return { removed: rows.length };
}

/** Move a source instance from its current claim to another (split surgery). */
export async function reassignInstance(input: {
  instanceId: string;
  toClaimId: string;
}): Promise<{ reassigned: boolean }> {
  const rows = await rawQuery<{ id: string }>(
    `UPDATE claim_instances SET claim_id = $1 WHERE id = $2 RETURNING id`,
    [input.toClaimId, input.instanceId]
  );
  return { reassigned: rows.length > 0 };
}
