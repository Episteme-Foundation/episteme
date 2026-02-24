/**
 * Contribution service -- DB operations for contributions, reviews, appeals.
 */
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  contributions,
  contributionReviews,
  appeals,
  arbitrationResults,
  type NewContribution,
} from "../db/schema.js";

export async function createContribution(input: {
  claimId: string;
  contributorId: string;
  contributionType: string;
  content: string;
  evidenceUrls?: string[];
  mergeTargetClaimId?: string;
  proposedCanonicalForm?: string;
}) {
  const db = getDb();
  const values: NewContribution = {
    claimId: input.claimId,
    contributorId: input.contributorId,
    contributionType: input.contributionType,
    content: input.content,
    evidenceUrls: input.evidenceUrls ?? [],
    mergeTargetClaimId: input.mergeTargetClaimId ?? null,
    proposedCanonicalForm: input.proposedCanonicalForm ?? null,
  };

  const [contribution] = await db
    .insert(contributions)
    .values(values)
    .returning();

  return contribution!;
}

export async function getContributionById(id: string) {
  const db = getDb();
  const [contribution] = await db
    .select()
    .from(contributions)
    .where(eq(contributions.id, id))
    .limit(1);
  return contribution ?? null;
}

export async function listContributions(filters: {
  claimId?: string;
  status?: string;
  contributionType?: string;
  limit: number;
  offset: number;
}) {
  const db = getDb();

  let conditions = sql`1=1`;
  if (filters.claimId) {
    conditions = sql`${conditions} AND ${contributions.claimId} = ${filters.claimId}`;
  }
  if (filters.status) {
    conditions = sql`${conditions} AND ${contributions.reviewStatus} = ${filters.status}`;
  }
  if (filters.contributionType) {
    conditions = sql`${conditions} AND ${contributions.contributionType} = ${filters.contributionType}`;
  }

  const rows = await db
    .select()
    .from(contributions)
    .where(conditions)
    .orderBy(desc(contributions.submittedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows;
}

export async function getReviewForContribution(contributionId: string) {
  const db = getDb();
  const [review] = await db
    .select()
    .from(contributionReviews)
    .where(eq(contributionReviews.contributionId, contributionId))
    .limit(1);
  return review ?? null;
}

export async function createAppeal(input: {
  contributionId: string;
  originalReviewId: string;
  appellantId: string;
  appealReasoning: string;
}) {
  const db = getDb();
  const [appeal] = await db
    .insert(appeals)
    .values({
      contributionId: input.contributionId,
      originalReviewId: input.originalReviewId,
      appellantId: input.appellantId,
      appealReasoning: input.appealReasoning,
    })
    .returning();

  return appeal!;
}

export async function getAppealById(id: string) {
  const db = getDb();
  const [appeal] = await db
    .select()
    .from(appeals)
    .where(eq(appeals.id, id))
    .limit(1);
  return appeal ?? null;
}

export async function getArbitrationForContribution(contributionId: string) {
  const db = getDb();
  const [result] = await db
    .select()
    .from(arbitrationResults)
    .where(eq(arbitrationResults.contributionId, contributionId))
    .limit(1);
  return result ?? null;
}
