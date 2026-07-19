CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"evidence" text NOT NULL,
	"recommendation" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"claim_id" uuid,
	"contribution_id" uuid,
	"review_id" uuid,
	"contributor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_type" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"triggered_by" text DEFAULT 'manual' NOT NULL,
	"dedupe_key" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"findings_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD COLUMN "superseded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_review_id_contribution_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."contribution_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_findings_status" ON "audit_findings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_findings_contributor" ON "audit_findings" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_findings_contribution" ON "audit_findings" USING btree ("contribution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_audit_runs_dedupe_key" ON "audit_runs" USING btree ("dedupe_key") WHERE dedupe_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_runs_requested" ON "audit_runs" USING btree ("requested_at");