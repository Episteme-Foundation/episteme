import { getDb } from "../db/client.js";
import { assessments } from "../db/schema.js";
import { eq, desc, and, gte, lte, count } from "drizzle-orm";

export async function getCurrentAssessment(claimId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.claimId, claimId), eq(assessments.isCurrent, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAssessmentHistory(
  claimId: string,
  options: { limit?: number; offset?: number; since?: Date; until?: Date } = {}
) {
  const db = getDb();
  const { limit = 20, offset = 0, since, until } = options;

  const conditions = [eq(assessments.claimId, claimId)];
  if (since) conditions.push(gte(assessments.assessedAt, since));
  if (until) conditions.push(lte(assessments.assessedAt, until));

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(assessments)
      .where(and(...conditions))
      .orderBy(desc(assessments.assessedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(assessments)
      .where(and(...conditions)),
  ]);

  return { assessments: rows, total: totalRows[0]?.count ?? 0 };
}

export async function getAssessmentTrajectory(claimId: string) {
  const db = getDb();
  const rows = await db
    .select({
      status: assessments.status,
      confidence: assessments.confidence,
      assessedAt: assessments.assessedAt,
      isCurrent: assessments.isCurrent,
      trigger: assessments.trigger,
    })
    .from(assessments)
    .where(eq(assessments.claimId, claimId))
    .orderBy(desc(assessments.assessedAt));

  const transitions = rows.length > 1
    ? rows.slice(0, -1).filter((r, i) => r.status !== rows[i + 1]!.status).length
    : 0;

  return {
    current: rows.find(r => r.isCurrent) ?? rows[0] ?? null,
    history: rows,
    totalAssessments: rows.length,
    statusTransitions: transitions,
  };
}
