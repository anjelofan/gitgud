CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"roster_entry_id" uuid NOT NULL,
	"repo_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster_entries" ADD COLUMN "claimed_user_id" uuid;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_roster_entry_id_roster_entries_id_fk" FOREIGN KEY ("roster_entry_id") REFERENCES "public"."roster_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_assignment_id_roster_entry_id_idx" ON "submissions" USING btree ("assignment_id","roster_entry_id");--> statement-breakpoint
CREATE INDEX "submissions_roster_entry_id_idx" ON "submissions" USING btree ("roster_entry_id");--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_entries_program_id_claimed_user_id_idx" ON "roster_entries" USING btree ("program_id","claimed_user_id");