import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  bigint,
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
    // How load-bearing the claim is (0..1), a revisable judgment set by the
    // Steward. Scales proportional effort and orders the Steward work queue so
    // important claims are processed first under a run budget (§"Claim Importance
    // and Proportional Effort"). 0.5 = default/medium until judged.
    importance: real("importance").notNull().default(0.5),
    // --- Steward work-queue state: the claim row IS the queue ---
    // A claim with steward_state='pending' is awaiting (re)processing by its
    // Steward; the drain always picks the highest-`importance` pending claim, so
    // under a budget the most load-bearing claims are stewarded and the rest stay
    // "embedded stubs". Re-triggers (a changed subclaim, a Curator action) just
    // set this back to 'pending', coalescing a propagation storm into one slot.
    // Lifecycle: pending → running → done | error (→ pending again on re-trigger).
    // 'deferred' is a low-importance subclaim intentionally held OUT of the drain
    // (#98 economic brake): created and embedded/matchable but not recursively
    // decomposed. A re-trigger promotes it back to 'pending'.
    stewardState: text("steward_state").notNull().default("pending"),
    stewardTrigger: text("steward_trigger"),
    stewardContext: text("steward_context"),
    stewardError: text("steward_error"),
    stewardedAt: timestamp("stewarded_at", { withTimezone: true }),
    // Consecutive failed Steward attempts on this claim. Transient failures (API
    // budget/credit outage, 429, 5xx, network) return the claim to 'pending'
    // WITHOUT counting here — they are not the claim's fault (#97). Only genuine
    // logic errors increment it; the claim parks as 'error' once it hits the
    // attempt cap, so a truly poison claim stops spinning while a transient
    // outage never permanently strands the graph.
    stewardAttempts: integer("steward_attempts").notNull().default(0),
    embedding: vector("embedding"),
    textSearch: tsvector("text_search"),
    // Which pipeline epoch minted this claim (config.pipelineEpoch at creation).
    // An epoch names a prompt/constitution era; when agent behavior changes
    // materially, the epoch is bumped and the previous cohort can be archived
    // wholesale (scripts/archive-legacy-claims.ts). NULL = legacy claims created
    // before stamping existed (the pre-2026-07 physics seed cohort).
    pipelineEpoch: text("pipeline_epoch"),
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
    // Drain ordering: among pending claims, highest importance first. The partial
    // index keeps it small (only the live work queue) and fast as the graph grows.
    index("idx_claims_steward_queue")
      .on(table.importance.desc(), table.updatedAt)
      .where(sql`steward_state = 'pending'`),
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
    trigger: text("trigger"),
    triggerContext: text("trigger_context"),
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
    // Whether this source asserts the canonical claim ("affirms") or its
    // negation/contrary ("denies"). Lets a claim and its denial share one
    // canonical node while preserving which side each source takes, so the
    // disagreement lives on the claim instead of in two mirror-image pages.
    stance: text("stance").notNull().default("affirms"),
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
    // Attribution for per-token metering (#70): the account and API key that
    // requested this job. Workers restore these into the LLM usage context so
    // background agent calls (extraction, matching) are billed to the
    // requesting user, not lost as anonymous work. Null = system-initiated.
    userId: uuid("user_id").references(() => contributors.id, {
      onDelete: "set null",
    }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_jobs_status").on(table.status)]
);

// ---------------------------------------------------------------------------
// contributors
//
// The single account table (issue #70): a *user* (API consumer) and a
// *contributor* (graph editor) are the same identity — one human, one row.
// `externalId` is the auth subject in the form "<provider>:<subject>"
// (e.g. "github:12345"), minted by the web app's sign-in flow; the API never
// talks to the auth provider itself. Consumer concerns (API keys, usage,
// credits) and contributor concerns (reputation, kudos — #71) both hang off
// this row.
// ---------------------------------------------------------------------------
export const contributors = pgTable("contributors", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").unique(),
  displayName: text("display_name").notNull(),
  email: text("email").unique(),
  avatarUrl: text("avatar_url"),
  reputationScore: real("reputation_score").notNull().default(50),
  contributionsAccepted: integer("contributions_accepted").notNull().default(0),
  contributionsRejected: integer("contributions_rejected").notNull().default(0),
  contributionsEscalated: integer("contributions_escalated")
    .notNull()
    .default(0),
  // Kudos total (#71) — denormalized SUM of kudos_events for cheap profile and
  // leaderboard reads; kudos_events is the source of truth.
  kudos: integer("kudos").notNull().default(0),
  // Good-faith-free / bad-faith-pay standing (#71):
  //   'good'     — contribution is free (always, even when rejected on merits).
  //   'must_pay' — a suspected-bad-faith flag was recorded; contributing now
  //                requires a deposit/fee. No payment rail exists yet, so this
  //                state returns 402 DEPOSIT_REQUIRED at POST /contributions
  //                (the payment seam, like the consumer credits ledger).
  //                Restored to 'good' when the flag is overturned on appeal.
  contributionStanding: text("contribution_standing").notNull().default("good"),
  badFaithFlags: integer("bad_faith_flags").notNull().default(0),
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
// api_keys
//
// DB-backed API keys (#70). A user mints keys from the dashboard; the key is
// shown once and only its SHA-256 hash is stored. Keys are high-entropy random
// strings, so a fast unsalted hash is the correct construction (unlike
// passwords) — it gives O(1) lookup by hash with no oracle risk.
//
// scope:
//   'user'    — a normal consumer key; acts as its owning user.
//   'service' — a trusted first-party key (e.g. the web frontend's BFF key)
//               that may additionally act ON BEHALF OF another user via the
//               x-acting-user header. Never issued from the public dashboard.
// ---------------------------------------------------------------------------
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // First characters of the plaintext key (e.g. "epk_a1b2c3d4"), kept so the
    // dashboard can identify a key without ever storing the key itself.
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scope: text("scope").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("idx_api_keys_user").on(table.userId)]
);

// ---------------------------------------------------------------------------
// llm_usage
//
// The per-token meter (#70): one row per LLM call, written at the single
// chokepoint in src/llm/client.ts. Captured at token granularity from day one
// because backfill is impossible; a credits ledger (Stripe metered billing)
// can later decrement against these rows without schema upheaval — see
// src/services/billing-service.ts for the seam.
//
// userId/apiKeyId null = system-initiated governance work (Steward sweeps,
// audits, contribution review), which is deliberately NOT billed to users:
// the metered surface is user-initiated agentic work (extraction, matching).
// ---------------------------------------------------------------------------
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => contributors.id, {
      onDelete: "set null",
    }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    // Which agent made the call (extractor, matcher, steward, curator,
    // contribution_reviewer, dispute_arbitrator, audit, ...) — set by the
    // agent's entry point via the usage context.
    agent: text("agent").notNull().default("unknown"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    // Derived cost in micro-USD (1e-6 USD) from src/llm/pricing.ts at insert
    // time, so historical rows keep the price that was in effect when the
    // tokens were spent.
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" })
      .notNull()
      .default(0),
    jobId: uuid("job_id"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_llm_usage_user_time").on(table.userId, table.createdAt),
    index("idx_llm_usage_key_time").on(table.apiKeyId, table.createdAt),
    index("idx_llm_usage_time").on(table.createdAt),
  ]
);

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
  // Suspected bad faith (#71) — distinct from rejected-on-the-merits. Only
  // meaningful alongside a 'reject' decision; drives the contributor's
  // must-pay standing and a reputation penalty. Appealable like any review.
  suspectedBadFaith: boolean("suspected_bad_faith").notNull().default(false),
  // 'spam' | 'vandalism' | 'sybil' | 'misinformation' when flagged.
  badFaithCategory: text("bad_faith_category"),
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

// ---------------------------------------------------------------------------
// reputation_events
//
// Append-only ledger of every reputation change (#71) — the audit trail that
// makes `contributors.reputation_score` load-bearing instead of a static
// default. One row per change, with the score after applying it, so a
// contributor's standing is always reconstructible and reversible (appeal
// overturns insert a compensating event rather than editing history).
// ---------------------------------------------------------------------------
export const reputationEvents = pgTable(
  "reputation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    // Nullable so the ledger outlives a deleted contribution/claim.
    contributionId: uuid("contribution_id").references(() => contributions.id, {
      onDelete: "set null",
    }),
    reviewId: uuid("review_id").references(() => contributionReviews.id, {
      onDelete: "set null",
    }),
    delta: real("delta").notNull(),
    scoreAfter: real("score_after").notNull(),
    // 'contribution_accepted' | 'contribution_rejected' | 'bad_faith_flag' |
    // 'appeal_overturned' | 'manual_adjustment'
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_reputation_events_contributor_time").on(
      table.contributorId,
      table.createdAt
    ),
    index("idx_reputation_events_contribution").on(table.contributionId),
  ]
);

// ---------------------------------------------------------------------------
// kudos_events
//
// Append-only ledger of kudos (#71) — recognition of *helpful* contributions,
// deliberately separate from reputation (which gates privileges). Mirrors the
// llm_usage meter's shape (per-event rows, time-bucketed indexes) so it can
// later convert to payouts for top contributors the way llm_usage maps onto a
// consumer credits ledger. `contributors.kudos` caches the SUM.
// ---------------------------------------------------------------------------
export const kudosEvents = pgTable(
  "kudos_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "cascade" }),
    contributionId: uuid("contribution_id").references(() => contributions.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(),
    // 'accepted_contribution' | 'survived_appeal' — see kudos-service.ts
    reason: text("reason").notNull(),
    // Who assigned it: 'system' (deterministic rules) today; peer signal or
    // review agents may join later without a schema change.
    awardedBy: text("awarded_by").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_kudos_events_contributor_time").on(
      table.contributorId,
      table.createdAt
    ),
    index("idx_kudos_events_time").on(table.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// reconciliation_events
//
// An append-only audit log of the Curator's re-individuation surgery (§18):
// every merge and split primitive records what it changed, in enough detail to
// be reversed. `reversed` flags an event that has been undone.
// ---------------------------------------------------------------------------
export const reconciliationEvents = pgTable("reconciliation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 'merge' | 'create_claim' | 'add_edge' | 'remove_edge' | 'reassign_instance'
  operation: text("operation").notNull(),
  reasoning: text("reasoning").notNull().default(""),
  // Operation-specific snapshot sufficient to reverse the change (moved ids,
  // pre-flip stances, deleted edge rows, previous state, …).
  payload: jsonb("payload").notNull().default({}),
  reversed: boolean("reversed").notNull().default(false),
  createdBy: text("created_by").notNull().default("curator"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
export type ContributionReview = typeof contributionReviews.$inferSelect;
export type NewContributionReview = typeof contributionReviews.$inferInsert;
export type Appeal = typeof appeals.$inferSelect;
export type NewAppeal = typeof appeals.$inferInsert;
export type ArbitrationResult = typeof arbitrationResults.$inferSelect;
export type NewArbitrationResult = typeof arbitrationResults.$inferInsert;
export type ReputationEvent = typeof reputationEvents.$inferSelect;
export type NewReputationEvent = typeof reputationEvents.$inferInsert;
export type KudosEvent = typeof kudosEvents.$inferSelect;
export type NewKudosEvent = typeof kudosEvents.$inferInsert;
