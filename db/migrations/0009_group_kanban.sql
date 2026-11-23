ALTER TABLE "note_groups" ADD COLUMN "kanban" json DEFAULT '{}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "note_groups" ADD COLUMN "kanban_version" integer DEFAULT 0 NOT NULL;