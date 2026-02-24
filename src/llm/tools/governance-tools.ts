/**
 * Shared read tools for governance agents.
 *
 * These give agents the ability to gather context about claims, contributions,
 * and contributors before making decisions.
 */
import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { rawQuery } from "../../db/client.js";
import {
  claims,
  assessments,
  claimInstances,
  arguments_,
  sources,
  contributions,
  contributionReviews,
  contributors,
} from "../../db/schema.js";

export function getGovernanceToolDefinitions(): Tool[] {
  return [
    {
      name: "get_claim_with_context",
      description:
        "Get comprehensive context about a claim: its text, type, current " +
        "assessment, subclaims, instances, and arguments. Use this to " +
        "understand the full state of a claim before making decisions.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim",
          },
        },
        required: ["claim_id"],
      },
    },
    {
      name: "get_contribution_details",
      description:
        "Get full details about a contribution, including the contributor, " +
        "the target claim, and any existing review.",
      input_schema: {
        type: "object" as const,
        properties: {
          contribution_id: {
            type: "string",
            description: "The UUID of the contribution",
          },
        },
        required: ["contribution_id"],
      },
    },
    {
      name: "get_contributor_profile",
      description:
        "Get a contributor's profile including reputation score, acceptance " +
        "history, and trust level.",
      input_schema: {
        type: "object" as const,
        properties: {
          contributor_id: {
            type: "string",
            description: "The UUID of the contributor",
          },
        },
        required: ["contributor_id"],
      },
    },
    {
      name: "get_claim_dependents",
      description:
        "Get all claims that depend on (have as a subclaim) a given claim. " +
        "Useful for understanding the impact of changing a claim's assessment.",
      input_schema: {
        type: "object" as const,
        properties: {
          claim_id: {
            type: "string",
            description: "The UUID of the claim to find dependents of",
          },
        },
        required: ["claim_id"],
      },
    },
    {
      name: "get_recent_decisions",
      description:
        "Get recent contribution review decisions, optionally filtered. " +
        "Useful for audit agents analyzing patterns.",
      input_schema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "integer",
            description: "Maximum number of results (default 20)",
          },
          decision_filter: {
            type: "string",
            description: "Filter by decision type: accept, reject, escalate",
          },
          contributor_id: {
            type: "string",
            description: "Filter by contributor ID",
          },
        },
      },
    },
  ];
}

export async function executeGovernanceTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "get_claim_with_context":
        return JSON.stringify(
          await getClaimWithContext(input.claim_id as string),
          null,
          2
        );

      case "get_contribution_details":
        return JSON.stringify(
          await getContributionDetails(input.contribution_id as string),
          null,
          2
        );

      case "get_contributor_profile":
        return JSON.stringify(
          await getContributorProfile(input.contributor_id as string),
          null,
          2
        );

      case "get_claim_dependents":
        return JSON.stringify(
          await getClaimDependents(input.claim_id as string),
          null,
          2
        );

      case "get_recent_decisions":
        return JSON.stringify(
          await getRecentDecisions(
            (input.limit as number) ?? 20,
            input.decision_filter as string | undefined,
            input.contributor_id as string | undefined
          ),
          null,
          2
        );

      default:
        return `Error: Unknown governance tool: ${toolName}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function getClaimWithContext(claimId: string) {
  const db = getDb();

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) return { error: `Claim not found: ${claimId}` };

  // Current assessment
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      sql`${assessments.claimId} = ${claimId} AND ${assessments.isCurrent} = true`
    )
    .limit(1);

  // Subclaims
  const subclaims = await rawQuery<{
    child_id: string;
    child_text: string;
    child_type: string;
    relation_type: string;
    confidence: number;
    child_status: string | null;
    child_confidence: number | null;
  }>(
    `SELECT cr.child_claim_id AS child_id, c.text AS child_text,
            c.claim_type AS child_type, cr.relation_type, cr.confidence,
            a.status AS child_status, a.confidence AS child_confidence
     FROM claim_relationships cr
     JOIN claims c ON c.id = cr.child_claim_id
     LEFT JOIN assessments a ON a.claim_id = cr.child_claim_id AND a.is_current = true
     WHERE cr.parent_claim_id = $1`,
    [claimId]
  );

  // Instances
  const instances = await db
    .select({
      originalText: claimInstances.originalText,
      context: claimInstances.context,
      confidence: claimInstances.confidence,
      sourceTitle: sources.title,
      sourceType: sources.sourceType,
      sourceUrl: sources.url,
    })
    .from(claimInstances)
    .innerJoin(sources, eq(sources.id, claimInstances.sourceId))
    .where(eq(claimInstances.claimId, claimId));

  // Arguments
  const args = await db
    .select()
    .from(arguments_)
    .where(eq(arguments_.claimId, claimId));

  return {
    claim: {
      id: claim.id,
      text: claim.text,
      claim_type: claim.claimType,
      state: claim.state,
      decomposition_status: claim.decompositionStatus,
      children_total: claim.childrenTotal,
      children_assessed: claim.childrenAssessed,
    },
    current_assessment: assessment
      ? {
          status: assessment.status,
          confidence: assessment.confidence,
          reasoning: assessment.reasoningTrace,
          assessed_at: assessment.assessedAt.toISOString(),
        }
      : null,
    subclaims: subclaims.map((sc) => ({
      id: sc.child_id,
      text: sc.child_text,
      type: sc.child_type,
      relation: sc.relation_type,
      confidence: sc.confidence,
      assessment_status: sc.child_status,
      assessment_confidence: sc.child_confidence,
    })),
    instances: instances.map((inst) => ({
      original_text: inst.originalText,
      context: inst.context,
      confidence: inst.confidence,
      source_title: inst.sourceTitle,
      source_type: inst.sourceType,
      source_url: inst.sourceUrl,
    })),
    arguments: args.map((a) => ({
      id: a.id,
      name: a.name,
      stance: a.stance,
      content: a.content,
    })),
  };
}

async function getContributionDetails(contributionId: string) {
  const db = getDb();

  const [contribution] = await db
    .select()
    .from(contributions)
    .where(eq(contributions.id, contributionId))
    .limit(1);

  if (!contribution)
    return { error: `Contribution not found: ${contributionId}` };

  // Contributor
  const [contributor] = await db
    .select()
    .from(contributors)
    .where(eq(contributors.id, contribution.contributorId))
    .limit(1);

  // Review if exists
  const [review] = await db
    .select()
    .from(contributionReviews)
    .where(eq(contributionReviews.contributionId, contributionId))
    .limit(1);

  // Target claim
  const [claim] = await db
    .select({ id: claims.id, text: claims.text, claimType: claims.claimType })
    .from(claims)
    .where(eq(claims.id, contribution.claimId))
    .limit(1);

  return {
    contribution: {
      id: contribution.id,
      type: contribution.contributionType,
      content: contribution.content,
      evidence_urls: contribution.evidenceUrls,
      review_status: contribution.reviewStatus,
      submitted_at: contribution.submittedAt.toISOString(),
      proposed_canonical_form: contribution.proposedCanonicalForm,
      merge_target_claim_id: contribution.mergeTargetClaimId,
    },
    contributor: contributor
      ? {
          id: contributor.id,
          display_name: contributor.displayName,
          reputation_score: contributor.reputationScore,
          contributions_accepted: contributor.contributionsAccepted,
          contributions_rejected: contributor.contributionsRejected,
          is_verified: contributor.isVerified,
        }
      : null,
    target_claim: claim
      ? { id: claim.id, text: claim.text, type: claim.claimType }
      : null,
    existing_review: review
      ? {
          decision: review.decision,
          reasoning: review.reasoning,
          confidence: review.confidence,
          policy_citations: review.policyCitations,
          reviewed_at: review.reviewedAt.toISOString(),
        }
      : null,
  };
}

async function getContributorProfile(contributorId: string) {
  const db = getDb();

  const [contributor] = await db
    .select()
    .from(contributors)
    .where(eq(contributors.id, contributorId))
    .limit(1);

  if (!contributor)
    return { error: `Contributor not found: ${contributorId}` };

  const total =
    contributor.contributionsAccepted +
    contributor.contributionsRejected +
    contributor.contributionsEscalated;

  let trustLevel: string;
  if (contributor.isSuspended) {
    trustLevel = "suspended";
  } else if (contributor.reputationScore >= 80) {
    trustLevel = "trusted";
  } else if (contributor.reputationScore >= 50) {
    trustLevel = "standard";
  } else if (contributor.reputationScore >= 20) {
    trustLevel = "probationary";
  } else {
    trustLevel = "restricted";
  }

  return {
    id: contributor.id,
    display_name: contributor.displayName,
    reputation_score: contributor.reputationScore,
    trust_level: trustLevel,
    is_verified: contributor.isVerified,
    is_suspended: contributor.isSuspended,
    suspension_reason: contributor.suspensionReason,
    contributions_accepted: contributor.contributionsAccepted,
    contributions_rejected: contributor.contributionsRejected,
    contributions_escalated: contributor.contributionsEscalated,
    total_contributions: total,
    acceptance_rate:
      total > 0
        ? Math.round((contributor.contributionsAccepted / total) * 100)
        : null,
    last_active_at: contributor.lastActiveAt.toISOString(),
  };
}

async function getClaimDependents(claimId: string) {
  const rows = await rawQuery<{
    parent_id: string;
    parent_text: string;
    parent_type: string;
    relation_type: string;
    parent_status: string | null;
  }>(
    `SELECT cr.parent_claim_id AS parent_id, c.text AS parent_text,
            c.claim_type AS parent_type, cr.relation_type,
            a.status AS parent_status
     FROM claim_relationships cr
     JOIN claims c ON c.id = cr.parent_claim_id
     LEFT JOIN assessments a ON a.claim_id = cr.parent_claim_id AND a.is_current = true
     WHERE cr.child_claim_id = $1`,
    [claimId]
  );

  return {
    child_claim_id: claimId,
    dependents: rows.map((r) => ({
      id: r.parent_id,
      text: r.parent_text,
      type: r.parent_type,
      relation: r.relation_type,
      current_status: r.parent_status,
    })),
    count: rows.length,
  };
}

async function getRecentDecisions(
  limit: number,
  decisionFilter?: string,
  contributorId?: string
) {
  const db = getDb();

  let conditions = sql`1=1`;
  if (decisionFilter) {
    conditions = sql`${conditions} AND ${contributionReviews.decision} = ${decisionFilter}`;
  }
  if (contributorId) {
    conditions = sql`${conditions} AND ${contributions.contributorId} = ${contributorId}`;
  }

  const rows = await db
    .select({
      reviewId: contributionReviews.id,
      decision: contributionReviews.decision,
      reasoning: contributionReviews.reasoning,
      confidence: contributionReviews.confidence,
      policyCitations: contributionReviews.policyCitations,
      reviewedAt: contributionReviews.reviewedAt,
      contributionType: contributions.contributionType,
      contributorId: contributions.contributorId,
      claimId: contributions.claimId,
    })
    .from(contributionReviews)
    .innerJoin(
      contributions,
      eq(contributions.id, contributionReviews.contributionId)
    )
    .where(conditions)
    .orderBy(desc(contributionReviews.reviewedAt))
    .limit(limit);

  return {
    decisions: rows.map((r) => ({
      review_id: r.reviewId,
      decision: r.decision,
      reasoning: r.reasoning,
      confidence: r.confidence,
      policy_citations: r.policyCitations,
      reviewed_at: r.reviewedAt.toISOString(),
      contribution_type: r.contributionType,
      contributor_id: r.contributorId,
      claim_id: r.claimId,
    })),
    count: rows.length,
  };
}
