import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom pgvector type
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    // Postgres returns vectors as '[0.1,0.2,...]'
    const str = String(value);
    return str
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

// Custom tsvector type (generated column, read-only)
const tsvector = customType<{ data: string; driverParam: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// claims
// ---------------------------------------------------------------------------
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    text: text("text").notNull(),
    claimType: text("claim_type").notNull().default("empirical_derived"),
    state: text("state").notNull().default("active"),
    mergedInto: uuid("merged_into").references((): any => claims.id),
    decompositionStatus: text("decomposition_status")
      .notNull()
      .default("pending"),
    childrenAssessed: integer("children_assessed").notNull().default(0),
    childrenTotal: integer("children_total").notNull().default(0),
    embedding: vector("embedding"),
    textSearch: tsvector("text_search"),
    createdBy: text("created_by").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_claims_state").on(table.state),
    index("idx_claims_updated").on(table.updatedAt),
  ]
);

// ---------------------------------------------------------------------------
// claim_relationships
// ---------------------------------------------------------------------------
export const claimRelationships = pgTable(
  "claim_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentClaimId: uuid("parent_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    childClaimId: uuid("child_claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull().default("requires"),
    argumentId: uuid("argument_id").references(() => arguments_.id, {
      onDelete: "set null",
    }),
    reasoning: text("reasoning").notNull(),
    confidence: real("confidence").notNull().default(1.0),
    createdBy: text("created_by").notNull().default("decomposer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_cr_unique").on(
      table.parentClaimId,
      table.childClaimId,
      table.relationType
    ),
    index("idx_cr_parent").on(table.parentClaimId),
    index("idx_cr_child").on(table.childClaimId),
    check(
      "no_self_reference",
      sql`${table.parentClaimId} != ${table.childClaimId}`
    ),
  ]
);

// ---------------------------------------------------------------------------
// assessments
// ---------------------------------------------------------------------------
export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    confidence: real("confidence").notNull(),
    reasoningTrace: text("reasoning_trace").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    subclaimSummary: jsonb("subclaim_summary").notNull().default({}),
    assessedAt: timestamp("assessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_assessments_current")
      .on(table.claimId)
      .where(sql`${table.isCurrent} = true`),
  ]
);

// ---------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------
export const arguments_ = pgTable(
  "arguments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    name: text("name"),
    description: text("description"),
    stance: text("stance").notNull(),
    content: text("content").notNull(),
    evidenceUrls: text("evidence_urls").array().notNull().default([]),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_arguments_claim").on(table.claimId)]
);

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").unique(),
  title: text("title").notNull(),
  contentHash: text("content_hash").unique(),
  rawContent: text("raw_content"),
  sourceType: text("source_type").notNull().default("unknown"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// claim_instances
// ---------------------------------------------------------------------------
export const claimInstances = pgTable(
  "claim_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    originalText: text("original_text").notNull(),
    context: text("context"),
    summaryContext: text("summary_context"),
    confidence: real("confidence").notNull().default(1.0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_instances_claim").on(table.claimId),
    index("idx_instances_source").on(table.sourceId),
  ]
);

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_jobs_status").on(table.status)]
);

// ---------------------------------------------------------------------------
// contributors
// ---------------------------------------------------------------------------
export const contributors = pgTable("contributors", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").unique(),
  displayName: text("display_name").notNull(),
  reputationScore: real("reputation_score").notNull().default(50),
  contributionsAccepted: integer("contributions_accepted").notNull().default(0),
  contributionsRejected: integer("contributions_rejected").notNull().default(0),
  contributionsEscalated: integer("contributions_escalated")
    .notNull()
    .default(0),
  isVerified: boolean("is_verified").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspensionReason: text("suspension_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// contributions
// ---------------------------------------------------------------------------
export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributors.id),
    contributionType: text("contribution_type").notNull(),
    content: text("content").notNull(),
    evidenceUrls: text("evidence_urls").array().notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewStatus: text("review_status").notNull().default("pending"),
    mergeTargetClaimId: uuid("merge_target_claim_id").references(
      () => claims.id
    ),
    proposedCanonicalForm: text("proposed_canonical_form"),
  },
  (table) => [
    index("idx_contributions_claim").on(table.claimId),
    index("idx_contributions_contributor").on(table.contributorId),
    index("idx_contributions_status").on(table.reviewStatus),
  ]
);

// ---------------------------------------------------------------------------
// contribution_reviews
// ---------------------------------------------------------------------------
export const contributionReviews = pgTable("contribution_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  contributionId: uuid("contribution_id")
    .notNull()
    .references(() => contributions.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: real("confidence").notNull(),
  policyCitations: text("policy_citations").array().notNull().default([]),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedBy: text("reviewed_by").notNull().default("contribution_reviewer"),
});

// ---------------------------------------------------------------------------
// appeals
// ---------------------------------------------------------------------------
export const appeals = pgTable(
  "appeals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    originalReviewId: uuid("original_review_id")
      .notNull()
      .references(() => contributionReviews.id),
    appellantId: uuid("appellant_id")
      .notNull()
      .references(() => contributors.id),
    appealReasoning: text("appeal_reasoning").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("pending"),
  },
  (table) => [
    index("idx_appeals_contribution").on(table.contributionId),
    index("idx_appeals_status").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// arbitration_results
// ---------------------------------------------------------------------------
export const arbitrationResults = pgTable("arbitration_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  contributionId: uuid("contribution_id")
    .notNull()
    .references(() => contributions.id, { onDelete: "cascade" }),
  appealId: uuid("appeal_id").references(() => appeals.id),
  outcome: text("outcome").notNull(),
  decision: text("decision").notNull(),
  reasoning: text("reasoning").notNull(),
  consensusAchieved: boolean("consensus_achieved"),
  modelVotes: jsonb("model_votes"),
  humanReviewRecommended: boolean("human_review_recommended")
    .notNull()
    .default(false),
  arbitratedAt: timestamp("arbitrated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  arbitratedBy: text("arbitrated_by").notNull().default("dispute_arbitrator"),
});

// Type exports
export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;
export type ClaimRelationship = typeof claimRelationships.$inferSelect;
export type NewClaimRelationship = typeof claimRelationships.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type Argument = typeof arguments_.$inferSelect;
export type NewArgument = typeof arguments_.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type ClaimInstance = typeof claimInstances.$inferSelect;
export type NewClaimInstance = typeof claimInstances.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Contributor = typeof contributors.$inferSelect;
export type NewContributor = typeof contributors.$inferInsert;
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
export type ContributionReview = typeof contributionReviews.$inferSelect;
export type NewContributionReview = typeof contributionReviews.$inferInsert;
export type Appeal = typeof appeals.$inferSelect;
export type NewAppeal = typeof appeals.$inferInsert;
export type ArbitrationResult = typeof arbitrationResults.$inferSelect;
export type NewArbitrationResult = typeof arbitrationResults.$inferInsert;
