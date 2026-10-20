ALTER TABLE "assignments" ADD COLUMN "grading_mode" text DEFAULT 'autograding' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "max_score" numeric(7, 2);