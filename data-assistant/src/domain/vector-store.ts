import type { ChunkContentType, ChunkLevel } from './chunk.js';
import type { SupportedMimeType } from './document.js';

export interface VectorChunkPayload {
  tenant_id: string;
  document_id: string;
  version_id: string;
  parent_chunk_id: string | null;
  chunk_level: ChunkLevel;
  chunk_type: ChunkContentType;
  chunk_index: number;
  page_number: number;
  page_end_number: number;
  heading_path: string[];
  document_title: string;
  mime_type: SupportedMimeType;
  embedding_model: string;
  is_active: boolean;
}

export interface VectorRecord {
  id: string; // Matches PostgreSQL chunks.id UUID
  denseVector: number[];
  payload: VectorChunkPayload;
}

export interface VectorSearchFilter {
  tenantId: string; // Mandatory — enforced on every query
  documentIds?: readonly string[] | undefined;
  mimeTypes?: readonly SupportedMimeType[] | undefined;
  chunkTypes?: readonly ChunkContentType[] | undefined;
  includeInactive?: boolean | undefined;
}

export interface VectorSearchHit {
  chunkId: string;
  score: number;
  payload: VectorChunkPayload;
}

export interface IVectorStore {
  ensureReady(modelName: string, dimensions: number): Promise<string>;
  upsertChunks(records: readonly VectorRecord[]): Promise<void>;
  deleteByVersionId(tenantId: string, versionId: string): Promise<void>;
  search(params: {
    vector: readonly number[];
    filter: VectorSearchFilter;
    topK: number;
    scoreThreshold?: number | undefined;
  }): Promise<VectorSearchHit[]>;
}