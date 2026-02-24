CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contribution_id" uuid NOT NULL,
	"original_review_id" uuid NOT NULL,
	"appellant_id" uuid NOT NULL,
	"appeal_reasoning" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arbitration_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contribution_id" uuid NOT NULL,
	"appeal_id" uuid,
	"outcome" text NOT NULL,
	"decision" text NOT NULL,
	"reasoning" text NOT NULL,
	"consensus_achieved" boolean,
	"model_votes" jsonb,
	"human_review_recommended" boolean DEFAULT false NOT NULL,
	"arbitrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"arbitrated_by" text DEFAULT 'dispute_arbitrator' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arguments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"name" text,
	"description" text,
	"stance" text NOT NULL,
	"content" text NOT NULL,
	"evidence_urls" text[] DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"status" text NOT NULL,
	"confidence" real NOT NULL,
	"reasoning_trace" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"subclaim_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"context" text,
	"summary_context" text,
	"confidence" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_claim_id" uuid NOT NULL,
	"child_claim_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'requires' NOT NULL,
	"argument_id" uuid,
	"reasoning" text NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT 'decomposer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_reference" CHECK ("claim_relationships"."parent_claim_id" != "claim_relationships"."child_claim_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"claim_type" text DEFAULT 'empirical_derived' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"merged_into" uuid,
	"decomposition_status" text DEFAULT 'pending' NOT NULL,
	"children_assessed" integer DEFAULT 0 NOT NULL,
	"children_total" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"text_search" "tsvector",
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribution_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contribution_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reasoning" text NOT NULL,
	"confidence" real NOT NULL,
	"policy_citations" text[] DEFAULT '{}' NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text DEFAULT 'contribution_reviewer' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"contribution_type" text NOT NULL,
	"content" text NOT NULL,
	"evidence_urls" text[] DEFAULT '{}' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"merge_target_claim_id" uuid,
	"proposed_canonical_form" text
);
--> statement-breakpoint
CREATE TABLE "contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"display_name" text NOT NULL,
	"reputation_score" real DEFAULT 50 NOT NULL,
	"contributions_accepted" integer DEFAULT 0 NOT NULL,
	"contributions_rejected" integer DEFAULT 0 NOT NULL,
	"contributions_escalated" integer DEFAULT 0 NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"suspension_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributors_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"content_hash" text,
	"raw_content" text,
	"source_type" text DEFAULT 'unknown' NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_url_unique" UNIQUE("url"),
	CONSTRAINT "sources_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_original_review_id_contribution_reviews_id_fk" FOREIGN KEY ("original_review_id") REFERENCES "public"."contribution_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_appellant_id_contributors_id_fk" FOREIGN KEY ("appellant_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arbitration_results" ADD CONSTRAINT "arbitration_results_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arbitration_results" ADD CONSTRAINT "arbitration_results_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arguments" ADD CONSTRAINT "arguments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_instances" ADD CONSTRAINT "claim_instances_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_instances" ADD CONSTRAINT "claim_instances_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_relationships" ADD CONSTRAINT "claim_relationships_parent_claim_id_claims_id_fk" FOREIGN KEY ("parent_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_relationships" ADD CONSTRAINT "claim_relationships_child_claim_id_claims_id_fk" FOREIGN KEY ("child_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_relationships" ADD CONSTRAINT "claim_relationships_argument_id_arguments_id_fk" FOREIGN KEY ("argument_id") REFERENCES "public"."arguments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_merged_into_claims_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_merge_target_claim_id_claims_id_fk" FOREIGN KEY ("merge_target_claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_appeals_contribution" ON "appeals" USING btree ("contribution_id");--> statement-breakpoint
CREATE INDEX "idx_appeals_status" ON "appeals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_arguments_claim" ON "arguments" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assessments_current" ON "assessments" USING btree ("claim_id") WHERE "assessments"."is_current" = true;--> statement-breakpoint
CREATE INDEX "idx_instances_claim" ON "claim_instances" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "idx_instances_source" ON "claim_instances" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cr_unique" ON "claim_relationships" USING btree ("parent_claim_id","child_claim_id","relation_type");--> statement-breakpoint
CREATE INDEX "idx_cr_parent" ON "claim_relationships" USING btree ("parent_claim_id");--> statement-breakpoint
CREATE INDEX "idx_cr_child" ON "claim_relationships" USING btree ("child_claim_id");--> statement-breakpoint
CREATE INDEX "idx_claims_state" ON "claims" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_claims_updated" ON "claims" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_contributions_claim" ON "contributions" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "idx_contributions_contributor" ON "contributions" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "idx_contributions_status" ON "contributions" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");