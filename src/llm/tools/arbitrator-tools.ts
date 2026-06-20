/**
 * Action tools for the Dispute Arbitrator agent.
 *
 * These let the arbitrator record decisions, notify the claim steward,
 * flag items for human review, and request multi-model consensus.
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
import { complete } from "../client.js";
import { loadConfig } from "../../config.js";
import { getArbitrationPolicies } from "../prompts/policies.js";

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
          consensus_achieved: {
            type: "boolean",
            description: "Whether multi-model consensus was achieved (if used)",
          },
          model_votes: {
            type: "object",
            description:
              "Model vote records when multi-model consensus was used. " +
              "Keys are model identifiers, values are objects with outcome, reasoning, and confidence.",
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
    {
      name: "request_second_opinion",
      description:
        "Request a second opinion from a different model for multi-model " +
        "consensus. The second model receives the same context but reasons " +
        "independently (no anchoring). Returns the second model's analysis.",
      input_schema: {
        type: "object" as const,
        properties: {
          case_summary: {
            type: "string",
            description:
              "Full summary of the case for the second model to evaluate independently",
          },
        },
        required: ["case_summary"],
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
        const consensusAchieved = input.consensus_achieved as boolean | undefined;

        const db = getDb();
        const policyCitations = (input.policy_citations as string[] | undefined) ?? [];
        const modelVotes = input.model_votes as Record<string, unknown> | undefined;

        await db.insert(arbitrationResults).values({
          contributionId,
          appealId: appealId ?? null,
          outcome,
          decision,
          reasoning: policyCitations.length > 0
            ? `${reasoning}\n\nPolicy citations: ${policyCitations.join(", ")}`
            : reasoning,
          consensusAchieved: consensusAchieved ?? null,
          modelVotes: modelVotes ?? null,
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

      case "request_second_opinion": {
        const caseSummary = input.case_summary as string;
        const config = loadConfig();

        if (!config.enableMultiModelConsensus) {
          return JSON.stringify({
            success: false,
            message: "Multi-model consensus is not enabled",
          });
        }

        // Use a distinct model for the second opinion to achieve genuine
        // multi-model consensus. Falls back to arbitrationModel only if
        // secondOpinionModel is not configured.
        const secondModel = config.secondOpinionModel ?? config.arbitrationModel;

        const result = await complete({
          messages: [
            {
              role: "user",
              content: `You are an independent reviewer evaluating a dispute case.
Analyze the following case and provide your assessment of the appropriate outcome.
Do NOT try to guess what another reviewer might say -- reason independently.

${caseSummary}

Provide your response in the following format:
OUTCOME: <one of: uphold_original, overturn, modify, mark_contested, human_review>
CONFIDENCE: <a number between 0.0 and 1.0>
REASONING: <your detailed reasoning>`,
            },
          ],
          system: getArbitrationPolicies(),
          model: secondModel,
          maxTokens: 4096,
        });

        return JSON.stringify({
          success: true,
          second_opinion: result.content,
          model_used: secondModel,
        });
      }

      default:
        return `Error: Unknown arbitrator tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
