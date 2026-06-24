CREATE TABLE "reconciliation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reversed" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'curator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
