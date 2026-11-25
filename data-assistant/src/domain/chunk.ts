import type { NormalizedDocument, SupportedMimeType } from './document.js';

export type ChunkingStrategyName =
  | 'fixed'
  | 'token'
  | 'sentence'
  | 'recursive'
  | 'markdown'
  | 'parent_child'
  | 'semantic';

export type ChunkLevel = 'standard' | 'parent' | 'child';
export type ChunkContentType = 'text' | 'table' | 'list' | 'code';

export interface ChunkMetadata {
  documentTitle: string;
  mimeType: SupportedMimeType;
  pageLabel?: string | undefined;
  sectionHeading?: string | undefined;
  strategy: ChunkingStrategyName;
  overlapTokens: number;
  sourceSha256: string;
}

export interface DocumentChunk {
  id: string;
  tenantId: string;
  documentId: string;
  versionId: string;
  parentChunkId: string | null;
  chunkLevel: ChunkLevel;
  chunkType: ChunkContentType;
  chunkIndex: number;
  pageNumber: number;
  pageEndNumber: number;
  headingPath: string[];
  content: string;
  contextualContent: string;
  tokenCount: number;
  charCount: number;
  contentHash: string;
  strategyName: ChunkingStrategyName;
  metadata: ChunkMetadata;
}

export interface ChunkingOptions {
  targetTokens: number;
  overlapTokens: number;
  parentTargetTokens?: number | undefined;
  childTargetTokens?: number | undefined;
}

export interface ITokenizer {
  readonly encodingName: string;
  countTokens(text: string): number;
  encode(text: string): number[];
  decode(tokens: readonly number[]): string;
}

export interface IChunker {
  readonly name: ChunkingStrategyName;
  chunk(document: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]>;
}