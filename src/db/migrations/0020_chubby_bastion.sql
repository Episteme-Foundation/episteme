ALTER TABLE "appeals" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "arbitration_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "review_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "review_attempts" integer DEFAULT 0 NOT NULL;