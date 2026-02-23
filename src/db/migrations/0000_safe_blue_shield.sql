CREATE TABLE "arguments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
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
	"confidence" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_claim_id" uuid NOT NULL,
	"child_claim_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'requires' NOT NULL,
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
ALTER TABLE "arguments" ADD CONSTRAINT "arguments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_instances" ADD CONSTRAINT "claim_instances_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_instances" ADD CONSTRAINT "claim_instances_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_relationships" ADD CONSTRAINT "claim_relationships_parent_claim_id_claims_id_fk" FOREIGN KEY ("parent_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_relationships" ADD CONSTRAINT "claim_relationships_child_claim_id_claims_id_fk" FOREIGN KEY ("child_claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_merged_into_claims_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_arguments_claim" ON "arguments" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assessments_current" ON "assessments" USING btree ("claim_id") WHERE "assessments"."is_current" = true;--> statement-breakpoint
CREATE INDEX "idx_instances_claim" ON "claim_instances" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "idx_instances_source" ON "claim_instances" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cr_unique" ON "claim_relationships" USING btree ("parent_claim_id","child_claim_id","relation_type");--> statement-breakpoint
CREATE INDEX "idx_cr_parent" ON "claim_relationships" USING btree ("parent_claim_id");--> statement-breakpoint
CREATE INDEX "idx_cr_child" ON "claim_relationships" USING btree ("child_claim_id");--> statement-breakpoint
CREATE INDEX "idx_claims_state" ON "claims" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_claims_updated" ON "claims" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");