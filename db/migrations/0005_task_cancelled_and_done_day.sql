ALTER TABLE "tasks" ADD COLUMN "done_day" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cancelled" boolean DEFAULT false NOT NULL;