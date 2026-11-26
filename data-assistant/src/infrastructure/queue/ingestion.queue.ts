import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';
import type { SupportedMimeType } from '../../domain/document.js';
import type { IObjectStorage } from '../../domain/storage.js';
import type { IVectorStore, VectorRecord } from '../../domain/vector-store.js';
import type { ChunkerRegistry } from '../../ingestion/chunking/chunker-registry.js';
import { validateChunkQuality } from '../../ingestion/chunking/quality-validator.js';
import { normalizeParsedDocument } from '../../ingestion/normalizer.js';
import type { ParserRegistry } from '../../ingestion/parsers/parser-registry.js';
import type { AppConfig } from '../../shared/config.js';
import { DocumentParsingError } from '../../shared/errors.js';
import type { Database } from '../db/client.js';
import { chunks, documents, documentVersions, ingestionJobs } from '../db/schema.js';
import type { EmbeddingService } from '../embeddings/embedding.service.js';

export const INGESTION_QUEUE_NAME = 'document-ingestion';

export interface IngestionJobPayload {
  ingestionJobId: string;
  tenantId: string;
  documentId: string;
  versionId: string;
  title: string;
  originalFilename: string;
  mimeType: SupportedMimeType;
  sha256Hash: string;
  storageKey: string;
}

export function createBullRedisConnection(redisUrl: string): Redis {
  // BullMQ requires maxRetriesPerRequest: null for blocking Redis queue commands
  const conn = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  conn.on('error', () => {});
  return conn;
}

export class IngestionQueue {
  public readonly queue: Queue<IngestionJobPayload>;
  private readonly connection: Redis;

  constructor(private readonly config: AppConfig) {
    this.connection = createBullRedisConnection(config.REDIS_URL);
    this.queue = new Queue<IngestionJobPayload>(INGESTION_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: config.INGESTION_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }

  async enqueue(payload: IngestionJobPayload): Promise<string> {
    const job = await this.queue.add('parse-document', payload, {
      jobId: payload.ingestionJobId,
    });
    return job.id ?? payload.ingestionJobId;
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export interface IngestionWorkerDependencies {
  config: AppConfig;
  db: Database;
  storage: IObjectStorage;
  parserRegistry: ParserRegistry;
  chunkerRegistry: ChunkerRegistry;
  embeddingService: EmbeddingService;
  vectorStore: IVectorStore;
  logger: FastifyBaseLogger;
}

export class IngestionWorker {
  private readonly worker: Worker<IngestionJobPayload>;
  private readonly connection: Redis;

  constructor(deps: IngestionWorkerDependencies) {
    const {
      config,
      db,
      storage,
      parserRegistry,
      chunkerRegistry,
      embeddingService,
      vectorStore,
      logger,
    } = deps;

    this.connection = createBullRedisConnection(config.REDIS_URL);

    this.worker = new Worker<IngestionJobPayload>(
      INGESTION_QUEUE_NAME,
      async (job: Job<IngestionJobPayload>) => {
        const data = job.data;
        const attempt = job.attemptsMade + 1;

        logger.info(
          { jobId: data.ingestionJobId, documentId: data.documentId, attempt },
          'Starting document ingestion job',
        );

        await db
          .update(ingestionJobs)
          .set({
            state: 'PROCESSING',
            attempts: attempt,
            startedAt: new Date(),
            errorCode: null,
            errorDetail: null,
          })
          .where(eq(ingestionJobs.id, data.ingestionJobId));

        await db
          .update(documentVersions)
          .set({ status: 'PROCESSING' })
          .where(eq(documentVersions.id, data.versionId));

        await db
          .update(documents)
          .set({ status: 'PROCESSING', updatedAt: new Date() })
          .where(eq(documents.id, data.documentId));

        try {
          // Stage 1: Load raw bytes, parse format, and normalize text (Phase 2)
          const rawBytes = await storage.getObject(data.storageKey);
          const parser = parserRegistry.getParser(data.mimeType);
          const parsed = await parser.parse(rawBytes, data.originalFilename);

          const normalized = normalizeParsedDocument({
            documentId: data.documentId,
            versionId: data.versionId,
            tenantId: data.tenantId,
            title: data.title,
            mimeType: data.mimeType,
            sha256Hash: data.sha256Hash,
            parsed,
          });

          // Stage 2: Chunk normalized pages and run automated quality checks (Phase 3)
          const chunker = chunkerRegistry.getChunker(config.CHUNKING_STRATEGY);
          const generatedChunks = await chunker.chunk(normalized, {
            targetTokens: config.CHUNK_TARGET_TOKENS,
            overlapTokens: config.CHUNK_OVERLAP_TOKENS,
            parentTargetTokens: config.PARENT_CHUNK_TOKENS,
            childTargetTokens: config.CHILD_CHUNK_TOKENS,
          });

          const quality = validateChunkQuality(normalized, generatedChunks);
          if (!quality.passed) {
            throw new DocumentParsingError(
              'EMPTY_CONTENT',
              `Chunk quality validation failed with ${quality.errorCount} error(s)`,
            );
          }

          if (quality.warningCount > 0) {
            logger.warn(
              {
                documentId: data.documentId,
                warningCount: quality.warningCount,
                warnings: quality.issues.filter((i) => i.severity === 'warning').slice(0, 10),
              },
              'Chunk quality warnings detected',
            );
          }

          // Persist normalized content and chunks atomically (idempotent on retry)
          await db.transaction(async (tx) => {
            await tx.delete(chunks).where(eq(chunks.versionId, data.versionId));

            const insertBatchSize = 200;
            for (let i = 0; i < generatedChunks.length; i += insertBatchSize) {
              const batch = generatedChunks.slice(i, i + insertBatchSize);
              await tx.insert(chunks).values(
                batch.map((c) => ({
                  id: c.id,
                  tenantId: c.tenantId,
                  documentId: c.documentId,
                  versionId: c.versionId,
                  parentChunkId: c.parentChunkId,
                  chunkLevel: c.chunkLevel,
                  chunkType: c.chunkType,
                  chunkIndex: c.chunkIndex,
                  pageNumber: c.pageNumber,
                  pageEndNumber: c.pageEndNumber,
                  headingPath: c.headingPath,
                  content: c.content,
                  contextualContent: c.contextualContent,
                  tokenCount: c.tokenCount,
                  charCount: c.charCount,
                  contentHash: c.contentHash,
                  strategyName: c.strategyName,
                  metadata: c.metadata as unknown as Record<string, unknown>,
                  isActive: true,
                })),
              );
            }

            await tx
              .update(documentVersions)
              .set({
                status: 'CHUNKED',
                parserName: normalized.parserName,
                parserVersion: normalized.parserVersion,
                pageCount: normalized.pageCount,
                charCount: normalized.totalCharCount,
                normalizedContent: normalized,
              })
              .where(eq(documentVersions.id, data.versionId));

            await tx
              .update(documents)
              .set({ status: 'CHUNKED', updatedAt: new Date() })
              .where(eq(documents.id, data.documentId));
          });

          // Stage 3: Embed leaf chunks (cached in Redis as Float32) & upsert to Qdrant (Phase 4)
          // Parent containers stay in PostgreSQL only; standard and child chunks are searchable
          const embeddable = generatedChunks.filter((c) => c.chunkLevel !== 'parent');
          const embedRes = await embeddingService.embedTexts(
            embeddable.map((c) => c.contextualContent),
            'document',
          );

          const vectorRecords: VectorRecord[] = embeddable.map((c, idx) => {
            const denseVector = embedRes.vectors[idx];
            if (!denseVector) {
              throw new Error(`Missing embedding vector for chunk index ${idx} (${c.id})`);
            }
            return {
              id: c.id,
              denseVector,
              payload: {
                tenant_id: c.tenantId,
                document_id: c.documentId,
                version_id: c.versionId,
                parent_chunk_id: c.parentChunkId,
                chunk_level: c.chunkLevel,
                chunk_type: c.chunkType,
                chunk_index: c.chunkIndex,
                page_number: c.pageNumber,
                page_end_number: c.pageEndNumber,
                heading_path: c.headingPath,
                document_title: c.metadata.documentTitle,
                mime_type: c.metadata.mimeType,
                embedding_model: embedRes.model,
                is_active: true,
              },
            };
          });

          // Remove any partial points from a prior failed attempt before upserting
          await vectorStore.deleteByVersionId(data.tenantId, data.versionId);
          await vectorStore.upsertChunks(vectorRecords);

          // Stage 4: Mark chunks, version, document, and job INDEXED/COMPLETED
          const now = new Date();
          const embeddableIds = embeddable.map((c) => c.id);

          await db.transaction(async (tx) => {
            if (embeddableIds.length > 0) {
              await tx
                .update(chunks)
                .set({
                  embeddingModel: embedRes.model,
                  embeddedAt: now,
                })
                .where(inArray(chunks.id, embeddableIds));
            }

            await tx
              .update(documentVersions)
              .set({
                status: 'INDEXED',
                embeddingModel: embedRes.model,
                embeddingDimensions: embedRes.dimensions,
              })
              .where(eq(documentVersions.id, data.versionId));

            await tx
              .update(documents)
              .set({
                status: 'INDEXED',
                currentVersionId: data.versionId,
                updatedAt: now,
              })
              .where(eq(documents.id, data.documentId));

            await tx
              .update(ingestionJobs)
              .set({
                state: 'COMPLETED',
                finishedAt: now,
              })
              .where(eq(ingestionJobs.id, data.ingestionJobId));
          });

          logger.info(
            {
              documentId: data.documentId,
              versionId: data.versionId,
              totalChunks: generatedChunks.length,
              vectorsIndexed: vectorRecords.length,
              embeddingModel: embedRes.model,
              dimensions: embedRes.dimensions,
              cacheHits: embedRes.cacheHits,
              cacheMisses: embedRes.cacheMisses,
            },
            'Document ingestion and vector indexing completed',
          );
        } catch (err) {
          const isPermanent = err instanceof DocumentParsingError && !err.retryable;
          const errorCode = err instanceof DocumentParsingError ? err.reason : 'INGESTION_ERROR';
          const errorDetail = err instanceof Error ? err.message : 'Unknown ingestion failure';
          const isFinalAttempt = isPermanent || attempt >= (job.opts.attempts ?? 1);

          if (isFinalAttempt) {
            await db.transaction(async (tx) => {
              await tx
                .update(ingestionJobs)
                .set({
                  state: 'FAILED',
                  errorCode,
                  errorDetail,
                  finishedAt: new Date(),
                })
                .where(eq(ingestionJobs.id, data.ingestionJobId));

              await tx
                .update(documentVersions)
                .set({ status: 'FAILED' })
                .where(eq(documentVersions.id, data.versionId));

              await tx
                .update(documents)
                .set({ status: 'FAILED', updatedAt: new Date() })
                .where(eq(documents.id, data.documentId));
            });
          }

          logger.error(
            { err, documentId: data.documentId, attempt, errorCode, isPermanent },
            'Document ingestion attempt failed',
          );

          if (isPermanent) {
            throw new UnrecoverableError(`${errorCode}: ${errorDetail}`);
          }
          throw err;
        }
      },
      {
        connection: this.connection,
        concurrency: config.INGESTION_CONCURRENCY,
      },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }
}