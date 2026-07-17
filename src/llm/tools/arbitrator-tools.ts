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
import { reverseReviewOutcome } from "../../services/reputation-service.js";
import {
  isIntakeContributionType,
  materializeAcceptedIntake,
  type IntakeMaterializationResult,
} from "../../services/intake-service.js";
import { getContributionById } from "../../services/contribution-service.js";

export function getArbitratorToolDefinitions(): Tool[] {
  return [
    {
      name: "record_arbitration_decision",
      description:
        "Record your arbitration decision. Writes the outcome and updates " +
        "the contribution and appeal status. An overturn also restores the " +
        "contributor and, for intake contributions, materializes them into " +
        "the graph; both happen automatically.",
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
        "Notify the claim steward about the arbitration outcome. The " +
        "Steward re-judges the claim; this is the only way an arbitration " +
        "changes a claim.",
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
        "Route a contribution to human review without recording an " +
        "arbitration. If you have reached a decision that humans should " +
        "review, prefer the human_review outcome of " +
        "record_arbitration_decision instead.",
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

        // An overturn that ACCEPTS an intake contribution (#157) must
        // materialize it, exactly as the reviewer's accept does — otherwise
        // an escalated proposal arbitrated in the contributor's favor would
        // read 'accepted' with nothing in the graph. Runs first so a failure
        // surfaces to the arbitrator; the call is idempotent.
        let materialization: IntakeMaterializationResult | null = null;
        if (outcome === "overturn") {
          const contribution = await getContributionById(contributionId);
          if (
            contribution &&
            isIntakeContributionType(contribution.contributionType)
          ) {
            materialization = await materializeAcceptedIntake(contributionId);
          }
        }

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

        // An overturned rejection restores the contributor (#71): reputation
        // penalties are compensated in the ledger, a bad-faith flag and its
        // must-pay standing are cleared, an auto-suspension lifts, and the
        // now-accepted contribution earns kudos (with a survived-scrutiny
        // bonus). False-positive flags must not leave lasting damage.
        let restoration = null;
        if (outcome === "overturn") {
          restoration = await reverseReviewOutcome({ contributionId });
        }

        return JSON.stringify({
          success: true,
          message: `Arbitration decision recorded: ${outcome} for contribution ${contributionId}`,
          ...(materialization ? { materialization } : {}),
          ...(restoration
            ? {
                contributor_restored: {
                  reputation: restoration.newScore,
                  standing_restored: restoration.standingRestored,
                  unsuspended: restoration.unsuspended,
                  kudos_awarded: restoration.kudosAwarded,
                },
              }
            : {}),
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
