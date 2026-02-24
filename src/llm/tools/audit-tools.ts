/**
 * Action tools for the Audit Agent.
 *
 * These let the audit agent flag issues, recommend re-reviews,
 * and adjust contributor reputation.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq } from "drizzle-orm";
import { getDb, rawQuery } from "../../db/client.js";
import {
  contributors,
  contributions,
} from "../../db/schema.js";
import { enqueueContribution } from "../../services/queue-service.js";

export function getAuditToolDefinitions(): Tool[] {
  return [
    {
      name: "flag_issue",
      description:
        "Flag a quality issue found during audit. Records the finding " +
        "for tracking and follow-up.",
      input_schema: {
        type: "object" as const,
        properties: {
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Severity of the issue",
          },
          category: {
            type: "string",
            description:
              "Category: decision_quality, consistency, process_compliance, " +
              "bias_detected, manipulation_suspected",
          },
          description: {
            type: "string",
            description: "Description of the issue",
          },
          evidence: {
            type: "string",
            description: "Evidence supporting the finding",
          },
          recommendation: {
            type: "string",
            description: "Recommended action",
          },
          affected_entity_id: {
            type: "string",
            description: "UUID of the affected claim, contribution, or contributor",
          },
        },
        required: [
          "severity",
          "category",
          "description",
          "evidence",
          "recommendation",
        ],
      },
    },
    {
      name: "recommend_re_review",
      description:
        "Recommend that a previous review decision be re-reviewed. " +
        "Enqueues the contribution for fresh review.",
      input_schema: {
        type: "object" as const,
        properties: {
          contribution_id: {
            type: "string",
            description: "The UUID of the contribution to re-review",
          },
          reason: {
            type: "string",
            description: "Why re-review is warranted",
          },
        },
        required: ["contribution_id", "reason"],
      },
    },
    {
      name: "adjust_contributor_reputation",
      description:
        "Adjust a contributor's reputation score. Use positive delta " +
        "for good patterns, negative for issues found.",
      input_schema: {
        type: "object" as const,
        properties: {
          contributor_id: {
            type: "string",
            description: "The UUID of the contributor",
          },
          delta: {
            type: "number",
            description: "Reputation change (positive or negative, typically -10 to +10)",
          },
          reason: {
            type: "string",
            description: "Reason for the adjustment",
          },
        },
        required: ["contributor_id", "delta", "reason"],
      },
    },
  ];
}

export async function executeAuditTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "flag_issue": {
        const severity = input.severity as string;
        const category = input.category as string;
        const description = input.description as string;
        const evidence = input.evidence as string;
        const recommendation = input.recommendation as string;
        const affectedEntityId = input.affected_entity_id as
          | string
          | undefined;

        // For now, audit findings are logged. A dedicated audit_findings
        // table could be added when the volume justifies it.
        const finding = {
          severity,
          category,
          description,
          evidence,
          recommendation,
          affected_entity_id: affectedEntityId,
          flagged_at: new Date().toISOString(),
          flagged_by: "audit_agent",
        };

        // TODO: Write to an audit_findings table when one exists.
        // For now, the finding is returned and the caller (audit pipeline)
        // can log it.

        return JSON.stringify({
          success: true,
          message: `Issue flagged: [${severity}] ${category}`,
          finding,
        });
      }

      case "recommend_re_review": {
        const contributionId = input.contribution_id as string;
        const reason = input.reason as string;

        const db = getDb();

        // Reset contribution status to pending for re-review
        await db
          .update(contributions)
          .set({ reviewStatus: "pending" })
          .where(eq(contributions.id, contributionId));

        // Re-enqueue for contribution review
        await enqueueContribution({ contributionId });

        return JSON.stringify({
          success: true,
          message: `Contribution ${contributionId} queued for re-review. Reason: ${reason}`,
        });
      }

      case "adjust_contributor_reputation": {
        const contributorId = input.contributor_id as string;
        const delta = input.delta as number;
        const reason = input.reason as string;

        // Clamp reputation to [0, 100]
        await rawQuery(
          `UPDATE contributors
           SET reputation_score = GREATEST(0, LEAST(100, reputation_score + $1))
           WHERE id = $2`,
          [delta, contributorId]
        );

        // Read back the new score
        const db = getDb();
        const [updated] = await db
          .select({ reputationScore: contributors.reputationScore })
          .from(contributors)
          .where(eq(contributors.id, contributorId))
          .limit(1);

        return JSON.stringify({
          success: true,
          message: `Reputation adjusted by ${delta > 0 ? "+" : ""}${delta} for contributor ${contributorId}. Reason: ${reason}`,
          new_score: updated?.reputationScore,
        });
      }

      default:
        return `Error: Unknown audit tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
