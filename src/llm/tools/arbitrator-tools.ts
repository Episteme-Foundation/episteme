/**
 * Action tools for the Dispute Arbitrator agent.
 *
 * These let the arbitrator record decisions, notify the claim steward,
 * and flag items for human review.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  arbitrationResults,
  contributions,
  appeals,
} from "../../db/schema.js";
import { enqueueSteward } from "../../services/queue-service.js";

export function getArbitratorToolDefinitions(): Tool[] {
  return [
    {
      name: "record_arbitration_decision",
      description:
        "Record your arbitration decision. This writes the outcome to the " +
        "database and updates the contribution/appeal status.",
      input_schema: {
        type: "object" as const,
        properties: {
          contribution_id: {
            type: "string",
            description: "The UUID of the contribution being arbitrated",
          },
          appeal_id: {
            type: "string",
            description: "The UUID of the appeal, if this is an appeal arbitration",
          },
          outcome: {
            type: "string",
            enum: [
              "uphold_original",
              "overturn",
              "modify",
              "mark_contested",
              "human_review",
            ],
            description: "The arbitration outcome",
          },
          decision: {
            type: "string",
            description: "Summary of the decision",
          },
          reasoning: {
            type: "string",
            description: "Detailed reasoning for the decision",
          },
          policy_citations: {
            type: "array",
            items: { type: "string" },
            description: "Policy codes cited in the decision",
          },
        },
        required: [
          "contribution_id",
          "outcome",
          "decision",
          "reasoning",
        ],
      },
    },
    {
      name: "notify_claim_steward",
      description:
        "Notify the claim steward about the arbitration outcome so they " +
        "can update the claim accordingly.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim",
          },
          change_type: {
            type: "string",
            description: "Type of change resulting from arbitration",
          },
          details: {
            type: "string",
            description: "Details about the arbitration outcome",
          },
        },
        required: ["claim_id", "change_type", "details"],
      },
    },
    {
      name: "flag_for_human_review",
      description:
        "Flag a specific contribution for human review. Use when the " +
        "situation is beyond what automated arbitration can handle.",
      input_schema: {
        type: "object" as const,
        properties: {
          contribution_id: {
            type: "string",
            description: "The UUID of the contribution to flag for human review",
          },
          reason: {
            type: "string",
            description: "Why human review is needed",
          },
        },
        required: ["contribution_id", "reason"],
      },
    },
  ];
}

export async function executeArbitratorTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "record_arbitration_decision": {
        const contributionId = input.contribution_id as string;
        const appealId = input.appeal_id as string | undefined;
        const outcome = input.outcome as string;
        const decision = input.decision as string;
        const reasoning = input.reasoning as string;

        const db = getDb();
        const policyCitations = (input.policy_citations as string[] | undefined) ?? [];

        await db.insert(arbitrationResults).values({
          contributionId,
          appealId: appealId ?? null,
          outcome,
          decision,
          reasoning: policyCitations.length > 0
            ? `${reasoning}\n\nPolicy citations: ${policyCitations.join(", ")}`
            : reasoning,
          humanReviewRecommended: outcome === "human_review",
          arbitratedBy: "dispute_arbitrator",
        });

        // Update contribution status based on outcome
        const reviewStatus =
          outcome === "overturn"
            ? "accepted"
            : outcome === "uphold_original"
              ? "rejected"
              : outcome === "mark_contested"
                ? "contested"
                : outcome === "human_review"
                  ? "human_review"
                  : "arbitrated";

        await db
          .update(contributions)
          .set({ reviewStatus })
          .where(eq(contributions.id, contributionId));

        // Update appeal status if applicable
        if (appealId) {
          await db
            .update(appeals)
            .set({ status: outcome === "human_review" ? "pending_human" : "resolved" })
            .where(eq(appeals.id, appealId));
        }

        return JSON.stringify({
          success: true,
          message: `Arbitration decision recorded: ${outcome} for contribution ${contributionId}`,
        });
      }

      case "notify_claim_steward": {
        const claimId = input.claim_id as string;
        const changeType = input.change_type as string;
        const details = input.details as string;

        await enqueueSteward({
          claimId,
          trigger: "contribution_accepted",
          context: `Arbitration outcome - ${changeType}: ${details}`,
        });

        return JSON.stringify({
          success: true,
          message: `Claim steward notified about claim ${claimId}`,
        });
      }

      case "flag_for_human_review": {
        const contributionId = input.contribution_id as string;
        const reason = input.reason as string;

        const db = getDb();
        await db
          .update(contributions)
          .set({ reviewStatus: "human_review" })
          .where(eq(contributions.id, contributionId));

        return JSON.stringify({
          success: true,
          message: `Contribution ${contributionId} flagged for human review: ${reason}`,
        });
      }

      default:
        return `Error: Unknown arbitrator tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
