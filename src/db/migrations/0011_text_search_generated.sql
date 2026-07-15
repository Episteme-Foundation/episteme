ALTER TABLE "claims" drop column "text_search";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "text_search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "claims"."text")) STORED;--> statement-breakpoint
CREATE INDEX "idx_claims_text_search" ON "claims" USING gin ("text_search");