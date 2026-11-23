CREATE TABLE "board_files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"unused_since" timestamp
);
--> statement-breakpoint
ALTER TABLE "board_files" ADD CONSTRAINT "board_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_files" ADD CONSTRAINT "board_files_group_id_note_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."note_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_files_group_id_idx" ON "board_files" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "board_files_user_id_idx" ON "board_files" USING btree ("user_id");