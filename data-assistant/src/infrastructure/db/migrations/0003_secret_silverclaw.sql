ALTER TABLE "chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "embedded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "embedding_dimensions" integer;