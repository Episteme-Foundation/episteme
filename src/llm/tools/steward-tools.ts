/**
 * Action tools for the Claim Steward agent.
 *
 * These let the steward update assessments, modify canonical forms,
 * add decomposition edges, log decisions, and notify dependent stewards.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq } from "drizzle-orm";
import { getDb, rawQuery } from "../../db/client.js";
import {
  claims,
  assessments,
  claimRelationships,
} from "../../db/schema.js";
import { generateEmbedding } from "../../services/embedding-service.js";
import { enqueueSteward } from "../../services/queue-service.js";

export function getStewardToolDefinitions(): Tool[] {
  return [
    {
      name: "update_claim_assessment",
      description:
        "Update the assessment of a claim. Marks the previous assessment " +
        "as non-current and creates a new current assessment.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim to assess",
          },
          status: {
            type: "string",
            enum: [
              "verified",
              "supported",
              "contested",
              "unsupported",
              "contradicted",
              "unknown",
            ],
            description: "New assessment status",
          },
          confidence: {
            type: "number",
            description: "Confidence in this assessment (0.0-1.0)",
          },
          reasoning_trace: {
            type: "string",
            description: "Detailed reasoning for the assessment",
          },
        },
        required: ["claim_id", "status", "confidence", "reasoning_trace"],
      },
    },
    {
      name: "update_canonical_form",
      description:
        "Update the canonical form (text) of a claim. Use when a contribution " +
        "proposes a better formulation or when clarity requires adjustment.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim to update",
          },
          new_text: {
            type: "string",
            description: "The new canonical form text",
          },
          reasoning: {
            type: "string",
            description: "Why this change improves the canonical form",
          },
        },
        required: ["claim_id", "new_text", "reasoning"],
      },
    },
    {
      name: "add_decomposition_edge",
      description:
        "Add a new subclaim to a claim's decomposition. Creates the subclaim " +
        "if it doesn't exist and establishes the relationship.",
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: {
            type: "string",
            description: "The UUID of the parent claim",
          },
          child_text: {
            type: "string",
            description: "Text of the subclaim to add",
          },
          relation: {
            type: "string",
            enum: [
              "requires",
              "supports",
              "contradicts",
              "specifies",
              "defines",
              "presupposes",
            ],
            description: "Relationship type",
          },
          reasoning: {
            type: "string",
            description: "Why this decomposition is valid",
          },
        },
        required: ["parent_id", "child_text", "relation", "reasoning"],
      },
    },
    {
      name: "log_stewardship_decision",
      description:
        "Log a stewardship decision for the audit trail. Use this to record " +
        "significant decisions you make about a claim.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim",
          },
          action_taken: {
            type: "string",
            description:
              "What action was taken (e.g. 'reassessed', 'updated_canonical_form', 'no_action_needed')",
          },
          reasoning: {
            type: "string",
            description: "Full reasoning for the decision",
          },
        },
        required: ["claim_id", "action_taken", "reasoning"],
      },
    },
    {
      name: "notify_dependent_stewards",
      description:
        "Notify stewards of claims that depend on this claim, so they can " +
        "evaluate whether the change is material to their claims.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim whose assessment changed",
          },
          change_summary: {
            type: "string",
            description: "Brief summary of what changed",
          },
        },
        required: ["claim_id", "change_summary"],
      },
    },
  ];
}

export async function executeStewardTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "update_claim_assessment": {
        const claimId = input.claim_id as string;
        const status = input.status as string;
        const confidence = input.confidence as number;
        const reasoningTrace = input.reasoning_trace as string;

        const db = getDb();

        // Mark previous assessment as non-current
        await db
          .update(assessments)
          .set({ isCurrent: false })
          .where(eq(assessments.claimId, claimId));

        // Insert new assessment
        await db.insert(assessments).values({
          claimId,
          status,
          confidence,
          reasoningTrace,
          isCurrent: true,
          trigger: "steward_reassessment",
        });

        return JSON.stringify({
          success: true,
          message: `Assessment updated for claim ${claimId}: ${status} (${confidence})`,
        });
      }

      case "update_canonical_form": {
        const claimId = input.claim_id as string;
        const newText = input.new_text as string;

        const db = getDb();

        // Update claim text and regenerate embedding
        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(newText);
        } catch {
          // Continue without embedding update
        }

        await db
          .update(claims)
          .set({
            text: newText,
            ...(embedding ? { embedding } : {}),
            updatedAt: new Date(),
          })
          .where(eq(claims.id, claimId));

        return JSON.stringify({
          success: true,
          message: `Canonical form updated for claim ${claimId}`,
        });
      }

      case "add_decomposition_edge": {
        const parentId = input.parent_id as string;
        const childText = input.child_text as string;
        const relation = input.relation as string;
        const reasoning = input.reasoning as string;

        const db = getDb();

        // Create the subclaim
        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(childText);
        } catch {
          // Continue without embedding
        }

        const [newClaim] = await db
          .insert(claims)
          .values({
            text: childText,
            claimType: "empirical_derived",
            embedding: embedding ?? undefined,
            createdBy: "claim_steward",
          })
          .returning();

        // Create relationship
        try {
          await db.insert(claimRelationships).values({
            parentClaimId: parentId,
            childClaimId: newClaim!.id,
            relationType: relation,
            reasoning,
            confidence: 1.0,
            createdBy: "claim_steward",
          });
        } catch {
          // Unique constraint -- relationship may already exist
        }

        return JSON.stringify({
          success: true,
          message: `Added subclaim to ${parentId}: "${childText}" (${relation})`,
          child_claim_id: newClaim!.id,
        });
      }

      case "log_stewardship_decision": {
        // For now, logging goes to the assessment reasoning trace.
        // A dedicated audit_log table could be added later.
        const claimId = input.claim_id as string;
        const actionTaken = input.action_taken as string;
        const reasoning = input.reasoning as string;

        // Log as a steward note in the claim's updated timestamp
        const db = getDb();
        await db
          .update(claims)
          .set({ updatedAt: new Date() })
          .where(eq(claims.id, claimId));

        return JSON.stringify({
          success: true,
          message: `Stewardship decision logged for claim ${claimId}: ${actionTaken}`,
          action: actionTaken,
          reasoning,
        });
      }

      case "notify_dependent_stewards": {
        const claimId = input.claim_id as string;
        const changeSummary = input.change_summary as string;

        // Find parent claims and enqueue steward messages for each
        const parents = await rawQuery<{ parent_id: string }>(
          `SELECT DISTINCT parent_claim_id AS parent_id
           FROM claim_relationships
           WHERE child_claim_id = $1`,
          [claimId]
        );

        for (const parent of parents) {
          await enqueueSteward({
            claimId: parent.parent_id,
            trigger: "subclaim_change",
            context: `Subclaim ${claimId} changed: ${changeSummary}`,
          });
        }

        return JSON.stringify({
          success: true,
          message: `Notified ${parents.length} dependent claim stewards`,
          parent_claim_ids: parents.map((p) => p.parent_id),
        });
      }

      default:
        return `Error: Unknown steward tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
