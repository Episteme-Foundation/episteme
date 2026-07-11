/**
 * Action tools for the Contribution Reviewer agent.
 *
 * These let the reviewer record decisions, provide feedback, escalate disputes,
 * and notify the claim steward -- all through tool calls.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  contributions,
  contributionReviews,
} from "../../db/schema.js";
import {
  enqueueArbitration,
  enqueueSteward,
} from "../../services/queue-service.js";
import {
  applyReviewOutcome,
  BAD_FAITH_CATEGORIES,
} from "../../services/reputation-service.js";

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
          suspected_bad_faith: {
            type: "boolean",
            description:
              "Set true ONLY with a 'reject' decision when the contribution " +
              "shows deliberate abuse (spam, vandalism, sybil coordination, " +
              "deliberate misinformation) — NOT for sincere contributions " +
              "rejected on the merits. This flag has real consequences " +
              "(reputation penalty, pay-to-contribute standing) and is " +
              "appealable; when uncertain, reject without the flag or escalate.",
          },
          bad_faith_category: {
            type: "string",
            enum: [...BAD_FAITH_CATEGORIES],
            description:
              "Required when suspected_bad_faith is true: which kind of abuse.",
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
        "situation requires deeper adjudication.",
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
        const decision = input.decision as "accept" | "reject" | "escalate";
        const reasoning = input.reasoning as string;
        const confidence = input.confidence as number;
        const policyCitations = (input.policy_citations as string[]) ?? [];
        // A bad-faith flag is only coherent on a rejection; anything else is
        // recorded as flag-free so the flag's consequences can't fire by
        // accident (#71: sincere contributions must never pay).
        const suspectedBadFaith =
          input.suspected_bad_faith === true && decision === "reject";
        const badFaithCategory = suspectedBadFaith
          ? ((input.bad_faith_category as string) ?? "spam")
          : null;

        const db = getDb();

        // Write review record
        const [review] = await db
          .insert(contributionReviews)
          .values({
            contributionId,
            decision,
            reasoning,
            confidence,
            policyCitations,
            suspectedBadFaith,
            badFaithCategory,
            reviewedBy: "contribution_reviewer",
          })
          .returning();

        // Update contribution status
        await db
          .update(contributions)
          .set({ reviewStatus: decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "escalated" })
          .where(eq(contributions.id, contributionId));

        // Counters, reputation ledger, standing, and kudos — one write path
        // in the reputation service (#71).
        const outcome = await applyReviewOutcome({
          contributionId,
          reviewId: review?.id ?? null,
          decision,
          suspectedBadFaith,
          badFaithCategory,
        });

        return JSON.stringify({
          success: true,
          message: `Review decision '${decision}' recorded for contribution ${contributionId}`,
          ...(input.suspected_bad_faith === true && !suspectedBadFaith
            ? {
                note: "suspected_bad_faith was ignored because the decision is not 'reject'",
              }
            : {}),
          ...(outcome
            ? {
                contributor: {
                  reputation: outcome.newScore,
                  standing: outcome.standing,
                  suspended: outcome.suspended,
                  kudos_awarded: outcome.kudosAwarded,
                },
              }
            : {}),
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
