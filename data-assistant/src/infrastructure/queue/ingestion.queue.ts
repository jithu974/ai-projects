import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { SupportedMimeType } from '../../domain/document.js';
import type { IObjectStorage } from '../../domain/storage.js';
import { normalizeParsedDocument } from '../../ingestion/normalizer.js';
import type { ParserRegistry } from '../../ingestion/parsers/parser-registry.js';
import type { AppConfig } from '../../shared/config.js';
import { DocumentParsingError } from '../../shared/errors.js';
import type { Database } from '../db/client.js';
import { chunks, documents, documentVersions, ingestionJobs } from '../db/schema.js';
import { ChunkerRegistry } from '../../ingestion/chunking/chunker-registry.js';
import { validateChunkQuality } from '../../ingestion/chunking/quality-validator.js';

export const INGESTION_QUEUE_NAME = 'document-ingestion';
const CHUNK_INSERT_BATCH_SIZE = 200;

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
  // BullMQ requires maxRetriesPerRequest: null for blocking commands
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

export class IngestionWorker {
  private readonly worker: Worker<IngestionJobPayload>;
  private readonly connection: Redis;

  constructor(params: {
    config: AppConfig;
    db: Database;
    storage: IObjectStorage;
    parserRegistry: ParserRegistry;
    logger: FastifyBaseLogger;
    chunkerRegistry: ChunkerRegistry;
  }) {
    const { config, db, storage, parserRegistry, logger, chunkerRegistry } = params;
    this.connection = createBullRedisConnection(config.REDIS_URL);

    this.worker = new Worker<IngestionJobPayload>(
      INGESTION_QUEUE_NAME,
      async (job: Job<IngestionJobPayload>) => {
        const data = job.data;
        const attempt = job.attemptsMade + 1;
        logger.info({ jobId: data.ingestionJobId, documentId: data.documentId, attempt }, 'Starting ingestion job');

        await db
          .update(ingestionJobs)
          .set({ state: 'PROCESSING', attempts: attempt, startedAt: new Date(), errorCode: null, errorDetail: null })
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
              { documentId: data.documentId, warnings: quality.issues },
              'Chunk quality warnings detected',
            );
          }

          await db.transaction(async (tx) => {
            await tx.delete(chunks).where(eq(chunks.versionId, data.versionId));

            for (let offset = 0; offset < generatedChunks.length; offset += CHUNK_INSERT_BATCH_SIZE) {
              const batch = generatedChunks
                .slice(offset, offset + CHUNK_INSERT_BATCH_SIZE)
                .map(({ metadata, ...chunk }) => ({ ...chunk, metadata: { ...metadata } }));

              await tx
                .insert(chunks)
                .values(batch);
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
              .set({ status: 'CHUNKED', currentVersionId: data.versionId, updatedAt: new Date() })
              .where(eq(documents.id, data.documentId));

            await tx
              .update(ingestionJobs)
              .set({ state: 'COMPLETED', finishedAt: new Date() })
              .where(eq(ingestionJobs.id, data.ingestionJobId));
          });

          logger.info(
            {
              documentId: data.documentId,
              pages: normalized.pageCount,
              chars: normalized.totalCharCount,
            },
            'Document ingestion completed',
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
                .set({ state: 'FAILED', errorCode, errorDetail, finishedAt: new Date() })
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

          logger.error({ err, documentId: data.documentId, errorCode, isPermanent }, 'Ingestion attempt failed');

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