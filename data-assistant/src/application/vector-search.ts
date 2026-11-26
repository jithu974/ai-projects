import { and, eq, inArray } from 'drizzle-orm';
import type { ChunkContentType } from '../domain/chunk.js';
import type { SupportedMimeType } from '../domain/document.js';
import type { IVectorStore } from '../domain/vector-store.js';
import type { Database } from '../infrastructure/db/client.js';
import { chunks } from '../infrastructure/db/schema.js';
import type { EmbeddingService } from '../infrastructure/embeddings/embedding.service.js';

export interface VectorSearchRequest {
  tenantId: string;
  query: string;
  topK: number;
  scoreThreshold?: number | undefined;
  documentIds?: readonly string[] | undefined;
  mimeTypes?: readonly SupportedMimeType[] | undefined;
  chunkTypes?: readonly ChunkContentType[] | undefined;
}

export class VectorSearchUseCase {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: IVectorStore,
    private readonly db: Database,
  ) {}

  async execute(req: VectorSearchRequest) {
    const startedAt = performance.now();

    const embedRes = await this.embeddingService.embedTexts([req.query], 'query');
    const queryVector = embedRes.vectors[0]!;

    const hits = await this.vectorStore.search({
      vector: queryVector,
      filter: {
        tenantId: req.tenantId,
        documentIds: req.documentIds,
        mimeTypes: req.mimeTypes,
        chunkTypes: req.chunkTypes,
      },
      topK: req.topK,
      scoreThreshold: req.scoreThreshold,
    });

    if (hits.length === 0) {
      return {
        query: req.query,
        model: embedRes.model,
        dimensions: embedRes.dimensions,
        embeddingCacheHit: embedRes.cacheHits > 0,
        latencyMs: Math.round(performance.now() - startedAt),
        results: [],
      };
    }

    const chunkIds = hits.map((h) => h.chunkId);
    const dbRows = await this.db
      .select()
      .from(chunks)
      .where(
        and(
          eq(chunks.tenantId, req.tenantId),
          eq(chunks.isActive, true),
          inArray(chunks.id, chunkIds),
        ),
      );

    const rowMap = new Map(dbRows.map((r) => [r.id, r]));

    // Preserve Qdrant relevance ranking while hydrating authoritative text from Postgres
    const hydrated = hits
      .map((hit) => {
        const row = rowMap.get(hit.chunkId);
        if (!row) return null;
        return {
          chunkId: row.id,
          score: Number(hit.score.toFixed(4)),
          documentId: row.documentId,
          versionId: row.versionId,
          documentTitle: hit.payload.document_title,
          mimeType: hit.payload.mime_type,
          pageNumber: row.pageNumber,
          pageEndNumber: row.pageEndNumber,
          headingPath: row.headingPath,
          chunkType: row.chunkType,
          content: row.content,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      query: req.query,
      model: embedRes.model,
      dimensions: embedRes.dimensions,
      embeddingCacheHit: embedRes.cacheHits > 0,
      latencyMs: Math.round(performance.now() - startedAt),
      results: hydrated,
    };
  }
}