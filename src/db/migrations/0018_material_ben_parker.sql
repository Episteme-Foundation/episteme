CREATE TABLE "argument_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"argument_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"content" text NOT NULL,
	"assessment_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_by" text DEFAULT 'claim_steward' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "argument_evaluations" ADD CONSTRAINT "argument_evaluations_argument_id_arguments_id_fk" FOREIGN KEY ("argument_id") REFERENCES "public"."arguments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "argument_evaluations" ADD CONSTRAINT "argument_evaluations_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_argument_evaluations_argument" ON "argument_evaluations" USING btree ("argument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_argument_evaluations_current" ON "argument_evaluations" USING btree ("argument_id") WHERE "argument_evaluations"."is_current" = true;