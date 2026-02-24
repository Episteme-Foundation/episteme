/**
 * Action tools for the Contribution Reviewer agent.
 *
 * These let the reviewer record decisions, provide feedback, escalate disputes,
 * and notify the claim steward -- all through tool calls.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq } from "drizzle-orm";
import { getDb, rawQuery } from "../../db/client.js";
import {
  contributions,
  contributionReviews,
} from "../../db/schema.js";
import {
  enqueueArbitration,
  enqueueSteward,
} from "../../services/queue-service.js";

export function getReviewerToolDefinitions(): Tool[] {
  return [
    {
      name: "record_review_decision",
      description:
        "Record your review decision for a contribution. This writes the " +
        "decision to the database and updates the contribution's review status.",
      input_schema: {
        type: "object" as const,
        properties: {
          contribution_id: {
            type: "string",
            description: "The UUID of the contribution being reviewed",
          },
          decision: {
            type: "string",
            enum: ["accept", "reject", "escalate"],
            description: "Your decision",
          },
          reasoning: {
            type: "string",
            description: "Detailed reasoning for your decision",
          },
          confidence: {
            type: "number",
            description: "Confidence in this decision (0.0-1.0)",
          },
          policy_citations: {
            type: "array",
            items: { type: "string" },
            description:
              "Policy codes cited (e.g. VERIFIABILITY, SOURCE_HIERARCHY, CHARITABLE_INTERPRETATION)",
          },
        },
        required: [
          "contribution_id",
          "decision",
          "reasoning",
          "confidence",
          "policy_citations",
        ],
      },
    },
    {
      name: "escalate_to_arbitrator",
      description:
        "Escalate a contribution to the dispute arbitrator for further " +
        "review. Use when uncertain, when stakes are high, or when the " +
        "situation requires multi-model consensus.",
      input_schema: {
        type: "object" as const,
        properties: {
          contribution_id: {
            type: "string",
            description: "The UUID of the contribution to escalate",
          },
          reason: {
            type: "string",
            description: "Why this needs arbitration",
          },
        },
        required: ["contribution_id", "reason"],
      },
    },
    {
      name: "notify_claim_steward",
      description:
        "Notify the claim steward that a claim may need attention due to " +
        "a contribution being accepted or other change.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim to notify about",
          },
          change_type: {
            type: "string",
            description:
              "Type of change: contribution_accepted, new_challenge, new_support",
          },
          details: {
            type: "string",
            description: "Details about what changed and why steward attention is needed",
          },
        },
        required: ["claim_id", "change_type", "details"],
      },
    },
  ];
}

export async function executeReviewerTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "record_review_decision": {
        const contributionId = input.contribution_id as string;
        const decision = input.decision as string;
        const reasoning = input.reasoning as string;
        const confidence = input.confidence as number;
        const policyCitations = (input.policy_citations as string[]) ?? [];

        const db = getDb();

        // Write review record
        await db.insert(contributionReviews).values({
          contributionId,
          decision,
          reasoning,
          confidence,
          policyCitations,
          reviewedBy: "contribution_reviewer",
        });

        // Update contribution status
        await db
          .update(contributions)
          .set({ reviewStatus: decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "escalated" })
          .where(eq(contributions.id, contributionId));

        // Atomically increment contributor stats
        const [contribution] = await db
          .select({ contributorId: contributions.contributorId })
          .from(contributions)
          .where(eq(contributions.id, contributionId))
          .limit(1);

        if (contribution) {
          const column =
            decision === "accept"
              ? "contributions_accepted"
              : decision === "reject"
                ? "contributions_rejected"
                : "contributions_escalated";
          await rawQuery(
            `UPDATE contributors SET ${column} = ${column} + 1 WHERE id = $1`,
            [contribution.contributorId]
          );
        }

        return JSON.stringify({
          success: true,
          message: `Review decision '${decision}' recorded for contribution ${contributionId}`,
        });
      }

      case "escalate_to_arbitrator": {
        const contributionId = input.contribution_id as string;
        const reason = input.reason as string;

        await enqueueArbitration({
          contributionId,
          trigger: "escalated_review",
        });

        // Update contribution status
        const db = getDb();
        await db
          .update(contributions)
          .set({ reviewStatus: "escalated" })
          .where(eq(contributions.id, contributionId));

        return JSON.stringify({
          success: true,
          message: `Contribution ${contributionId} escalated to arbitrator. Reason: ${reason}`,
        });
      }

      case "notify_claim_steward": {
        const claimId = input.claim_id as string;
        const changeType = input.change_type as string;
        const details = input.details as string;

        await enqueueSteward({
          claimId,
          trigger: "contribution_accepted",
          context: `${changeType}: ${details}`,
        });

        return JSON.stringify({
          success: true,
          message: `Claim steward notified about claim ${claimId}`,
        });
      }

      default:
        return `Error: Unknown reviewer tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
