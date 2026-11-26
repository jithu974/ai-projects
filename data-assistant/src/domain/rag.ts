import type { ChunkContentType } from './chunk.js';
import type { SupportedMimeType } from './document.js';
import type { LlmTokenUsage } from './llm.js';

export interface RetrievedChunk {
  chunkId: string;
  score: number;
  documentId: string;
  versionId: string;
  documentTitle: string;
  mimeType: SupportedMimeType;
  pageNumber: number;
  pageEndNumber: number;
  headingPath: string[];
  chunkType: string;
  content: string;
}

export interface RetrievalQuery {
  tenantId: string;
  query: string;
  topK: number;
  scoreThreshold?: number | undefined;
  documentIds?: readonly string[] | undefined;
  mimeTypes?: readonly SupportedMimeType[] | undefined;
  chunkTypes?: readonly ChunkContentType[] | undefined;
}

export interface RetrievalResponse {
  query: string;
  model: string;
  dimensions: number;
  embeddingCacheHit: boolean;
  latencyMs: number;
  results: RetrievedChunk[];
}

export interface IRetriever {
  execute(req: RetrievalQuery): Promise<RetrievalResponse>;
}

export interface ContextSourceItem {
  sourceLabel: string; // e.g. "S1", "S2"
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  pageEndNumber: number;
  headingPath: string[];
  score: number;
  tokenCount: number;
  excerpt: string;
}

export interface BuiltContext {
  formattedContext: string;
  sources: ContextSourceItem[];
  totalContextTokens: number;
  droppedChunksCount: number;
}

export type RagAbstentionReason = 'NO_RELEVANT_CONTEXT' | 'INSUFFICIENT_EVIDENCE';

export interface AskQuestionInput {
  tenantId: string;
  question: string;
  topK?: number | undefined;
  scoreThreshold?: number | undefined;
  filters?:
    | {
        documentIds?: readonly string[] | undefined;
        mimeTypes?: readonly SupportedMimeType[] | undefined;
        chunkTypes?: readonly ChunkContentType[] | undefined;
      }
    | undefined;
  includeDebug?: boolean | undefined;
}

export interface RagDebugTrace {
  systemPrompt: string;
  userPrompt: string;
  retrievedChunks: RetrievedChunk[];
  droppedChunksCount: number;
  contextTokens: number;
}

export interface AskQuestionResult {
  question: string;
  answer: string;
  grounded: boolean;
  abstained: boolean;
  abstentionReason: RagAbstentionReason | null;
  sources: ContextSourceItem[];
  model: {
    provider: string;
    name: string;
    llmCalled: boolean;
  };
  usage: LlmTokenUsage;
  timingsMs: {
    retrieval: number;
    generation: number;
    total: number;
  };
  debug?: RagDebugTrace | undefined;
}