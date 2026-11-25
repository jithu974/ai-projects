import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ChunkingStrategyName, DocumentChunk } from '../domain/chunk.js';
import type { SupportedMimeType } from '../domain/document.js';
import type { IObjectStorage } from '../domain/storage.js';
import type { Database } from '../infrastructure/db/client.js';
import { chunks, documents, documentVersions, ingestionJobs, tenants } from '../infrastructure/db/schema.js';
import type { IngestionQueue } from '../infrastructure/queue/ingestion.queue.js';
import { validateUploadedFile } from '../ingestion/file-validator.js';
import type { ChunkerRegistry } from '../ingestion/chunking/chunker-registry.js';
import { validateChunkQuality, type ChunkQualityReport } from '../ingestion/chunking/quality-validator.js';
import type { AppConfig } from '../shared/config.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';

export interface UploadResult {
  deduplicated: boolean;
  documentId: string;
  versionId: string;
  jobId: string | null;
  status: string;
  sha256Hash: string;
}

export class IngestDocumentUseCase {
  constructor(
    private readonly db: Database,
    private readonly storage: IObjectStorage,
    private readonly queue: IngestionQueue,
    private readonly maxUploadBytes: number,
    private readonly chunkerRegistry: ChunkerRegistry,
    private readonly chunkingConfig: Pick<
      AppConfig,
      'CHUNK_OVERLAP_TOKENS' | 'PARENT_CHUNK_TOKENS' | 'CHILD_CHUNK_TOKENS'
    >,
  ) {}

  async upload(params: {
    tenantId: string;
    filename: string;
    buffer: Buffer;
    titleOverride?: string;
  }): Promise<UploadResult> {
    const [tenant] = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .limit(1);

    if (!tenant) {
      throw new NotFoundError(`Tenant ${params.tenantId} not found`);
    }

    const validated = await validateUploadedFile({
      buffer: params.buffer,
      filename: params.filename,
      maxBytes: this.maxUploadBytes,
    });

    // SHA-256 duplicate detection per tenant
    const [existing] = await this.db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, params.tenantId),
          eq(documentVersions.sha256Hash, validated.sha256Hash),
        ),
      )
      .limit(1);

    if (existing) {
      return {
        deduplicated: true,
        documentId: existing.documentId,
        versionId: existing.id,
        jobId: null,
        status: existing.status,
        sha256Hash: existing.sha256Hash,
      };
    }

    const documentId = randomUUID();
    const versionId = randomUUID();
    const ingestionJobId = randomUUID();
    const title = params.titleOverride?.trim() || validated.sanitizedTitle;
    const storageKey = `${params.tenantId}/${documentId}/${versionId}.bin`;

    await this.storage.putObject(storageKey, validated.buffer);

    await this.db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        tenantId: params.tenantId,
        title,
        originalFilename: validated.originalFilename,
        mimeType: validated.mimeType,
        currentVersionId: versionId,
        status: 'PENDING',
      });

      await tx.insert(documentVersions).values({
        id: versionId,
        documentId,
        tenantId: params.tenantId,
        versionNumber: 1,
        sha256Hash: validated.sha256Hash,
        storageKey,
        fileSizeBytes: validated.fileSizeBytes,
        status: 'PENDING',
      });

      await tx.insert(ingestionJobs).values({
        id: ingestionJobId,
        tenantId: params.tenantId,
        documentId,
        documentVersionId: versionId,
        state: 'QUEUED',
      });
    });

    const bullJobId = await this.queue.enqueue({
      ingestionJobId,
      tenantId: params.tenantId,
      documentId,
      versionId,
      title,
      originalFilename: validated.originalFilename,
      mimeType: validated.mimeType,
      sha256Hash: validated.sha256Hash,
      storageKey,
    });

    await this.db
      .update(ingestionJobs)
      .set({ bullJobId })
      .where(eq(ingestionJobs.id, ingestionJobId));

    return {
      deduplicated: false,
      documentId,
      versionId,
      jobId: ingestionJobId,
      status: 'PENDING',
      sha256Hash: validated.sha256Hash,
    };
  }

  async retryFailedDocument(tenantId: string, documentId: string): Promise<{ jobId: string }> {
    const [doc] = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)))
      .limit(1);

    if (!doc || !doc.currentVersionId) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    const [version] = await this.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, doc.currentVersionId))
      .limit(1);

    if (!version) throw new NotFoundError('Document version not found');
    if (version.status !== 'FAILED') {
      throw new ValidationError(`Only FAILED documents can be retried (current status: ${version.status})`);
    }

    const newJobId = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(ingestionJobs).values({
        id: newJobId,
        tenantId,
        documentId: doc.id,
        documentVersionId: version.id,
        state: 'QUEUED',
      });
      await tx.update(documentVersions).set({ status: 'PENDING' }).where(eq(documentVersions.id, version.id));
      await tx.update(documents).set({ status: 'PENDING', updatedAt: new Date() }).where(eq(documents.id, doc.id));
    });

    await this.queue.enqueue({
      ingestionJobId: newJobId,
      tenantId,
      documentId: doc.id,
      versionId: version.id,
      title: doc.title,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType as SupportedMimeType,
      sha256Hash: version.sha256Hash,
      storageKey: version.storageKey,
    });

    return { jobId: newJobId };
  }

  async getDocumentStatus(tenantId: string, documentId: string) {
    const [doc] = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)))
      .limit(1);

    if (!doc) throw new NotFoundError(`Document ${documentId} not found`);

    const [latestJob] = await this.db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.documentId, doc.id))
      .orderBy(desc(ingestionJobs.createdAt))
      .limit(1);

    const [version] = doc.currentVersionId
      ? await this.db
          .select({
            id: documentVersions.id,
            versionNumber: documentVersions.versionNumber,
            sha256Hash: documentVersions.sha256Hash,
            fileSizeBytes: documentVersions.fileSizeBytes,
            parserName: documentVersions.parserName,
            pageCount: documentVersions.pageCount,
            charCount: documentVersions.charCount,
            status: documentVersions.status,
          })
          .from(documentVersions)
          .where(eq(documentVersions.id, doc.currentVersionId))
          .limit(1)
      : [undefined];

    return { document: doc, version: version ?? null, latestJob: latestJob ?? null };
  }

  async getDocumentChunks(tenantId: string, documentId: string) {
    const [document] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)))
      .limit(1);

    if (!document) throw new NotFoundError(`Document ${documentId} not found`);

    return this.db
      .select({
        id: chunks.id,
        chunkLevel: chunks.chunkLevel,
        chunkType: chunks.chunkType,
        pageNumber: chunks.pageNumber,
        headingPath: chunks.headingPath,
        tokenCount: chunks.tokenCount,
        content: chunks.content,
        contextualContent: chunks.contextualContent,
        metadata: chunks.metadata,
      })
      .from(chunks)
      .where(
        and(
          eq(chunks.tenantId, tenantId),
          eq(chunks.documentId, documentId),
          eq(chunks.isActive, true),
        ),
      )
      .orderBy(asc(chunks.chunkIndex));
  }

  async compareDocumentChunks(
    tenantId: string,
    documentId: string,
    strategy: Exclude<ChunkingStrategyName, 'semantic'>,
    targetTokens: number,
  ): Promise<{ chunks: DocumentChunk[]; quality: ChunkQualityReport }> {
    const [document] = await this.db
      .select({ currentVersionId: documents.currentVersionId })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)))
      .limit(1);

    if (!document) throw new NotFoundError(`Document ${documentId} not found`);
    if (!document.currentVersionId) {
      throw new ValidationError('Document has no normalized content to compare');
    }

    const [version] = await this.db
      .select({ normalizedContent: documentVersions.normalizedContent })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.id, document.currentVersionId),
          eq(documentVersions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!version?.normalizedContent) {
      throw new ValidationError('Document has no normalized content to compare');
    }

    const generatedChunks = await this.chunkerRegistry.getChunker(strategy).chunk(
      version.normalizedContent,
      {
        targetTokens,
        overlapTokens: this.chunkingConfig.CHUNK_OVERLAP_TOKENS,
        parentTargetTokens: this.chunkingConfig.PARENT_CHUNK_TOKENS,
        childTargetTokens: this.chunkingConfig.CHILD_CHUNK_TOKENS,
      },
    );

    return {
      chunks: generatedChunks,
      quality: validateChunkQuality(version.normalizedContent, generatedChunks),
    };
  }
}