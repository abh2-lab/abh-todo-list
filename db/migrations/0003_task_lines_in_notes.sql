ALTER TABLE "tasks" ADD COLUMN "doc_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "in_note" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_doc_id_idx" ON "tasks" USING btree ("doc_id");