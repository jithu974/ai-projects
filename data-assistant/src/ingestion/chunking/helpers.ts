import { createHash, randomUUID } from 'node:crypto';
import type {
  ChunkContentType,
  ChunkingStrategyName,
  ChunkLevel,
  DocumentChunk,
  ITokenizer,
} from '../../domain/chunk.js';
import type { NormalizedDocument } from '../../domain/document.js';

export function hashChunkContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

export function buildContextualContent(params: {
  documentTitle: string;
  headingPath: readonly string[];
  pageNumber: number;
  content: string;
}): string {
  const breadcrumb =
    params.headingPath.length > 0
      ? `${params.documentTitle} > ${params.headingPath.join(' > ')}`
      : params.documentTitle;
  return `${breadcrumb}\n${params.content}`;
}

export function createDocumentChunk(params: {
  id?: string;
  doc: NormalizedDocument;
  tokenizer: ITokenizer;
  strategyName: ChunkingStrategyName;
  chunkIndex: number;
  pageNumber: number;
  pageEndNumber?: number;
  pageLabel?: string | undefined;
  headingPath?: string[];
  chunkLevel?: ChunkLevel;
  chunkType?: ChunkContentType;
  parentChunkId?: string | null;
  overlapTokens: number;
  content: string;
}): DocumentChunk {
  const trimmed = params.content.trim();
  const headingPath = params.headingPath ?? [];
  const contextualContent = buildContextualContent({
    documentTitle: params.doc.title,
    headingPath,
    pageNumber: params.pageNumber,
    content: trimmed,
  });

  return {
    id: params.id ?? randomUUID(),
    tenantId: params.doc.tenantId,
    documentId: params.doc.documentId,
    versionId: params.doc.versionId,
    parentChunkId: params.parentChunkId ?? null,
    chunkLevel: params.chunkLevel ?? 'standard',
    chunkType: params.chunkType ?? 'text',
    chunkIndex: params.chunkIndex,
    pageNumber: params.pageNumber,
    pageEndNumber: params.pageEndNumber ?? params.pageNumber,
    headingPath,
    content: trimmed,
    contextualContent,
    tokenCount: params.tokenizer.countTokens(contextualContent),
    charCount: trimmed.length,
    contentHash: hashChunkContent(trimmed),
    strategyName: params.strategyName,
    metadata: {
      documentTitle: params.doc.title,
      mimeType: params.doc.mimeType,
      ...(params.pageLabel !== undefined ? { pageLabel: params.pageLabel } : {}),
      ...(headingPath.length > 0 ? { sectionHeading: headingPath[headingPath.length - 1] } : {}),
      strategy: params.strategyName,
      overlapTokens: params.overlapTokens,
      sourceSha256: params.doc.sha256Hash,
    },
  };
}

export function splitIntoSentences(text: string): string[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const sentences: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const cleaned = segment.trim();
    if (cleaned.length > 0) sentences.push(cleaned);
  }
  return sentences;
}

export function sliceOverlapTail(
  text: string,
  overlapTokens: number,
  tokenizer: ITokenizer,
): string {
  if (overlapTokens <= 0 || !text.trim()) return '';
  const tokens = tokenizer.encode(text);
  if (tokens.length <= overlapTokens) return text.trim();
  return tokenizer.decode(tokens.slice(tokens.length - overlapTokens)).trim();
}