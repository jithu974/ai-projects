CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"parent_chunk_id" uuid,
	"chunk_level" text DEFAULT 'standard' NOT NULL,
	"chunk_type" text DEFAULT 'text' NOT NULL,
	"chunk_index" integer NOT NULL,
	"page_number" integer NOT NULL,
	"page_end_number" integer NOT NULL,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" text NOT NULL,
	"contextual_content" text NOT NULL,
	"token_count" integer NOT NULL,
	"char_count" integer NOT NULL,
	"content_hash" text NOT NULL,
	"strategy_name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_parent_chunk_id_chunks_id_fk" FOREIGN KEY ("parent_chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chunks_tenant_doc" ON "chunks" USING btree ("tenant_id","document_id");--> statement-breakpoint
CREATE INDEX "idx_chunks_version" ON "chunks" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_chunks_parent" ON "chunks" USING btree ("parent_chunk_id");