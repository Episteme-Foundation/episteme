ALTER TABLE "contributions" ALTER COLUMN "claim_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;