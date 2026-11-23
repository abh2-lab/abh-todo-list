CREATE TABLE "group_notes" (
	"group_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_notes_group_id_doc_id_pk" PRIMARY KEY("group_id","doc_id")
);
--> statement-breakpoint
CREATE TABLE "note_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"board" json DEFAULT '{}'::json NOT NULL,
	"board_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_notes" ADD CONSTRAINT "group_notes_group_id_note_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."note_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_notes" ADD CONSTRAINT "group_notes_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_groups" ADD CONSTRAINT "note_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_notes_doc_id_idx" ON "group_notes" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "note_groups_user_id_idx" ON "note_groups" USING btree ("user_id");