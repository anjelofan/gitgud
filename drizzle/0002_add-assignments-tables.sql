CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"assignment_name" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"invite_token" text NOT NULL,
	"template_repo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_program_id_idx" ON "assignments" USING btree ("program_id");