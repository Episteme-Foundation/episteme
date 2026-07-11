CREATE TABLE "kudos_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"contribution_id" uuid,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"awarded_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"contribution_id" uuid,
	"review_id" uuid,
	"delta" real NOT NULL,
	"score_after" real NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD COLUMN "suspected_bad_faith" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD COLUMN "bad_faith_category" text;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "kudos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "contribution_standing" text DEFAULT 'good' NOT NULL;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "bad_faith_flags" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kudos_events" ADD CONSTRAINT "kudos_events_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos_events" ADD CONSTRAINT "kudos_events_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_review_id_contribution_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."contribution_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_kudos_events_contributor_time" ON "kudos_events" USING btree ("contributor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_kudos_events_time" ON "kudos_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_reputation_events_contributor_time" ON "reputation_events" USING btree ("contributor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_reputation_events_contribution" ON "reputation_events" USING btree ("contribution_id");