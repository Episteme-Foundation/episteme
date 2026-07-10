CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scope" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"agent" text DEFAULT 'unknown' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"job_id" uuid,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_contributors_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_contributors_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_user_time" ON "llm_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_key_time" ON "llm_usage" USING btree ("api_key_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_time" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_contributors_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_email_unique" UNIQUE("email");