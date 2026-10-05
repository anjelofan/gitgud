ALTER TABLE "assignments" ADD COLUMN "grading_workflow" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "score" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "max_score" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "grading_run_id" bigint;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "grading_conclusion" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "grading_head_sha" text;--> statement-breakpoint
CREATE INDEX "submissions_repo_name_idx" ON "submissions" USING btree ("repo_name");