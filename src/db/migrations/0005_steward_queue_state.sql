ALTER TABLE "claims" ADD COLUMN "steward_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "steward_trigger" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "steward_context" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "steward_error" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "stewarded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_claims_steward_queue" ON "claims" USING btree ("importance" DESC NULLS LAST,"updated_at") WHERE steward_state = 'pending';