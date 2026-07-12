import { rawQuery } from "../db/client.js";
import type { TreeNode } from "../schemas/claim.js";

interface TreeRow {
  id: string;
  text: string;
  claim_type: string;
  state: string;
  parent_id: string | null;
  relation_type: string | null;
  reasoning: string | null;
  confidence: number | null;
  depth: number;
  assessment_status: string | null;
  assessment_confidence: number | null;
  argument_id: string | null;
  argument_name: string | null;
  argument_stance: string | null;
}

/**
 * Fetch the full claim tree using a recursive CTE.
 * Returns flat rows which are then assembled into a nested tree.
 */
export async function getClaimTree(
  claimId: string,
  maxDepth: number = 5
): Promise<TreeNode | null> {
  const rows = await rawQuery<TreeRow>(
    `
    WITH RECURSIVE tree AS (
      SELECT c.id, c.text, c.claim_type, c.state,
        NULL::uuid AS parent_id, NULL::text AS relation_type,
        NULL::text AS reasoning, NULL::real AS confidence,
        NULL::uuid AS argument_id, 0 AS depth
      FROM claims c WHERE c.id = $1
      UNION ALL
      SELECT child.id, child.text, child.claim_type, child.state,
        cr.parent_claim_id, cr.relation_type, cr.reasoning, cr.confidence,
        cr.argument_id, tree.depth + 1
      FROM tree
      JOIN claim_relationships cr ON cr.parent_claim_id = tree.id
      JOIN claims child ON child.id = cr.child_claim_id
      WHERE tree.depth < $2
        AND child.state = 'active'
    )
    SELECT t.*,
      a.status AS assessment_status, a.confidence AS assessment_confidence,
      arg.name AS argument_name, arg.stance AS argument_stance
    FROM tree t
    LEFT JOIN assessments a ON a.claim_id = t.id AND a.is_current = true
    LEFT JOIN arguments arg ON arg.id = t.argument_id
    `,
    [claimId, maxDepth]
  );

  if (rows.length === 0) return null;

  return assembleTree(rows);
}

export interface DependentClaim {
  id: string;
  text: string;
  claim_type: string;
  relation_type: string;
  importance: number;
  assessment_status: string | null;
  assessment_confidence: number | null;
}

/**
 * Get the claims that depend on (have as a subclaim) the given claim — the
 * reverse of the decomposition tree. Each row is a parent claim plus the
 * relationship edge by which it leans on this claim, and the parent's current
 * assessment. Mirrors the agents' `get_claim_dependents` graph query.
 *
 * Ordered by importance so consumers that truncate (the claim map shows a few
 * chips plus a count) surface the most load-bearing dependents first.
 */
export async function getClaimDependents(claimId: string): Promise<DependentClaim[]> {
  return rawQuery<DependentClaim>(
    `SELECT cr.parent_claim_id AS id, c.text, c.claim_type,
            cr.relation_type, c.importance,
            a.status AS assessment_status, a.confidence AS assessment_confidence
     FROM claim_relationships cr
     JOIN claims c ON c.id = cr.parent_claim_id
     LEFT JOIN assessments a ON a.claim_id = cr.parent_claim_id AND a.is_current = true
     WHERE cr.child_claim_id = $1 AND c.state = 'active'
     ORDER BY c.importance DESC, a.confidence DESC NULLS LAST, c.text`,
    [claimId]
  );
}

/**
 * Paginated variant for GET /claims/:id/dependents (issue #102): the claim map
 * recentres often and only shows a handful of dependent chips plus a count, so
 * a hub claim with hundreds of dependents must not ship them all — nor drag
 * the whole deep payload (tree, arguments, instances) along for the ride.
 * `total` comes from a window function so page + count stay one query; the
 * offset-past-the-end case falls back to a bare count.
 */
export async function listClaimDependents(
  claimId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ dependents: DependentClaim[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const rows = await rawQuery<DependentClaim & { total: string }>(
    `SELECT cr.parent_claim_id AS id, c.text, c.claim_type,
            cr.relation_type, c.importance,
            a.status AS assessment_status, a.confidence AS assessment_confidence,
            COUNT(*) OVER ()::text AS total
     FROM claim_relationships cr
     JOIN claims c ON c.id = cr.parent_claim_id
     LEFT JOIN assessments a ON a.claim_id = cr.parent_claim_id AND a.is_current = true
     WHERE cr.child_claim_id = $1 AND c.state = 'active'
     ORDER BY c.importance DESC, a.confidence DESC NULLS LAST, c.text
     LIMIT $2 OFFSET $3`,
    [claimId, limit, offset]
  );
  if (rows.length === 0) {
    const [count] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM claim_relationships cr
         JOIN claims c ON c.id = cr.parent_claim_id
        WHERE cr.child_claim_id = $1 AND c.state = 'active'`,
      [claimId]
    );
    return { dependents: [], total: parseInt(count?.count ?? "0", 10) };
  }
  return {
    dependents: rows.map(({ total: _total, ...dep }) => dep),
    total: parseInt(rows[0]!.total, 10),
  };
}

/**
 * Get direct subclaim count for a claim.
 */
export async function getSubclaimCount(claimId: string): Promise<number> {
  const rows = await rawQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM claim_relationships cr
       JOIN claims c ON c.id = cr.child_claim_id
      WHERE cr.parent_claim_id = $1 AND c.state = 'active'`,
    [claimId]
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}

/**
 * Assemble flat CTE rows into a nested tree structure.
 */
function assembleTree(rows: TreeRow[]): TreeNode {
  const nodeMap = new Map<string, TreeNode>();

  // Create all nodes
  for (const row of rows) {
    // Use the first occurrence of each node (shallowest depth)
    if (!nodeMap.has(row.id)) {
      nodeMap.set(row.id, {
        id: row.id,
        text: row.text,
        claim_type: row.claim_type,
        state: row.state,
        depth: row.depth,
        relation_type: row.relation_type,
        reasoning: row.reasoning,
        confidence: row.confidence,
        assessment_status: row.assessment_status,
        assessment_confidence: row.assessment_confidence,
        argument_id: row.argument_id,
        argument_name: row.argument_name,
        argument_stance: row.argument_stance,
        children: [],
      });
    }
  }

  // Build parent-child relationships
  for (const row of rows) {
    if (row.parent_id) {
      const parent = nodeMap.get(row.parent_id);
      const child = nodeMap.get(row.id);
      if (parent && child) {
        // Update child with relationship metadata from this specific edge
        const childWithEdge: TreeNode = {
          ...child,
          relation_type: row.relation_type,
          reasoning: row.reasoning,
          confidence: row.confidence,
          argument_id: row.argument_id,
          argument_name: row.argument_name,
          argument_stance: row.argument_stance,
        };
        parent.children.push(childWithEdge);
      }
    }
  }

  // Root is the node with no parent (depth 0)
  const root = rows.find((r) => r.depth === 0);
  return nodeMap.get(root!.id)!;
}
