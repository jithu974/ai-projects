import type { DocumentChunk } from '../../domain/chunk.js';
import type { NormalizedDocument } from '../../domain/document.js';

export type ChunkQualityCode =
  | 'EMPTY_CHUNK'
  | 'DUPLICATE_CHUNK'
  | 'LOST_HEADING'
  | 'BROKEN_SENTENCE'
  | 'MISSING_METADATA'
  | 'INVALID_PAGE_REFERENCE';

export interface ChunkQualityIssue {
  chunkIndex: number;
  chunkId: string;
  severity: 'error' | 'warning';
  code: ChunkQualityCode;
  message: string;
}

export interface ChunkQualityReport {
  passed: boolean;
  totalChunks: number;
  errorCount: number;
  warningCount: number;
  issues: ChunkQualityIssue[];
}

const HAS_HEADING_RE = /^#{1,6}\s+.+/m;
const SENTENCE_END_RE = /[.!?:)"'\]`]$/;

export function validateChunkQuality(
  doc: NormalizedDocument,
  chunks: readonly DocumentChunk[],
): ChunkQualityReport {
  const issues: ChunkQualityIssue[] = [];
  const seenHashesByLevel = new Set<string>();
  const docHasHeadings = doc.pages.some((p) => HAS_HEADING_RE.test(p.content));

  for (const chunk of chunks) {
    // 1. Empty chunk check
    if (!chunk.content.trim() || chunk.tokenCount <= 0) {
      issues.push({
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.id,
        severity: 'error',
        code: 'EMPTY_CHUNK',
        message: 'Chunk has empty content or zero tokens',
      });
    }

    // 2. Duplicate chunk check (scoped per chunkLevel so parent + identical single child aren't false positives)
    const dedupeKey = `${chunk.chunkLevel}:${chunk.contentHash}`;
    if (seenHashesByLevel.has(dedupeKey)) {
      issues.push({
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.id,
        severity: 'warning',
        code: 'DUPLICATE_CHUNK',
        message: `Duplicate chunk content detected (hash ${chunk.contentHash.slice(0, 12)})`,
      });
    } else {
      seenHashesByLevel.add(dedupeKey);
    }

    // 3. Missing required source metadata
    if (
      !chunk.tenantId ||
      !chunk.documentId ||
      !chunk.versionId ||
      !chunk.metadata.documentTitle ||
      !chunk.metadata.sourceSha256
    ) {
      issues.push({
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.id,
        severity: 'error',
        code: 'MISSING_METADATA',
        message: 'Chunk is missing required tenant, document, version, or source hash metadata',
      });
    }

    // 4. Page reference bounds check
    if (
      chunk.pageNumber < 1 ||
      chunk.pageEndNumber < chunk.pageNumber ||
      chunk.pageEndNumber > doc.pageCount
    ) {
      issues.push({
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.id,
        severity: 'error',
        code: 'INVALID_PAGE_REFERENCE',
        message: `Page range ${chunk.pageNumber}-${chunk.pageEndNumber} exceeds document pageCount (${doc.pageCount})`,
      });
    }

    // 5. Lost headings check
    if (docHasHeadings && chunk.headingPath.length === 0) {
      issues.push({
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.id,
        severity: 'warning',
        code: 'LOST_HEADING',
        message: 'Source document contains Markdown headings, but chunk has no headingPath',
      });
    }

    // 6. Broken sentence heuristic (prose chunks only; skip tables/code/lists)
    if (chunk.chunkType === 'text' && chunk.content.length > 20) {
      const trimmed = chunk.content.trim();
      const startsLowercaseWord = /^[a-z]/.test(trimmed);
      const endsMidSentence = !SENTENCE_END_RE.test(trimmed);
      if (startsLowercaseWord || endsMidSentence) {
        issues.push({
          chunkIndex: chunk.chunkIndex,
          chunkId: chunk.id,
          severity: 'warning',
          code: 'BROKEN_SENTENCE',
          message: startsLowercaseWord
            ? 'Prose chunk begins mid-sentence with a lowercase letter'
            : 'Prose chunk ends without terminal punctuation',
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    passed: errorCount === 0,
    totalChunks: chunks.length,
    errorCount,
    warningCount,
    issues,
  };
}