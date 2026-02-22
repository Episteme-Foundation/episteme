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
        NULL::text AS reasoning, NULL::real AS confidence, 0 AS depth
      FROM claims c WHERE c.id = $1
      UNION ALL
      SELECT child.id, child.text, child.claim_type, child.state,
        cr.parent_claim_id, cr.relation_type, cr.reasoning, cr.confidence,
        tree.depth + 1
      FROM tree
      JOIN claim_relationships cr ON cr.parent_claim_id = tree.id
      JOIN claims child ON child.id = cr.child_claim_id
      WHERE tree.depth < $2
    )
    SELECT t.*, a.status AS assessment_status, a.confidence AS assessment_confidence
    FROM tree t
    LEFT JOIN assessments a ON a.claim_id = t.id AND a.is_current = true
    `,
    [claimId, maxDepth]
  );

  if (rows.length === 0) return null;

  return assembleTree(rows);
}

/**
 * Get direct subclaim count for a claim.
 */
export async function getSubclaimCount(claimId: string): Promise<number> {
  const rows = await rawQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM claim_relationships WHERE parent_claim_id = $1`,
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
        };
        parent.children.push(childWithEdge);
      }
    }
  }

  // Root is the node with no parent (depth 0)
  const root = rows.find((r) => r.depth === 0);
  return nodeMap.get(root!.id)!;
}
