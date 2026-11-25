import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import type { NormalizedDocument } from '../../domain/document.js';

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  rateLimitRpm: integer('rate_limit_rpm').notNull().default(60),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    currentVersionId: uuid('current_version_id'),
    status: text('status').notNull().default('PENDING'), // PENDING | PROCESSING | PARSED | FAILED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('idx_documents_tenant').on(table.tenantId)],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull().default(1),
    sha256Hash: text('sha256_hash').notNull(),
    storageKey: text('storage_key').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    parserName: text('parser_name'),
    parserVersion: text('parser_version'),
    pageCount: integer('page_count'),
    charCount: integer('char_count'),
    normalizedContent: jsonb('normalized_content').$type<NormalizedDocument>(),
    status: text('status').notNull().default('PENDING'), // PENDING | PROCESSING | PARSED | FAILED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_doc_versions_tenant_hash').on(table.tenantId, table.sha256Hash),
    index('idx_doc_versions_document').on(table.documentId),
  ],
);

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    documentVersionId: uuid('document_version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'cascade' }),
    bullJobId: text('bull_job_id'),
    state: text('state').notNull().default('QUEUED'), // QUEUED | PROCESSING | COMPLETED | FAILED
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_ingestion_jobs_version').on(table.documentVersionId)],
);