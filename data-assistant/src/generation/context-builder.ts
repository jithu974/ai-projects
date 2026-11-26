import { createHash } from 'node:crypto';
import type { ITokenizer } from '../domain/chunk.js';
import type { BuiltContext, ContextSourceItem, RetrievedChunk } from '../domain/rag.js';

export class ContextBuilder {
  constructor(private readonly tokenizer: ITokenizer) {}

  build(chunks: readonly RetrievedChunk[], maxContextTokens: number): BuiltContext {
    const seenContentHashes = new Set<string>();
    const blocks: string[] = [];
    const sources: ContextSourceItem[] = [];

    let usedTokens = 0;
    let droppedChunksCount = 0;

    for (const chunk of chunks) {
      const normalizedText = chunk.content.trim();
      if (!normalizedText) {
        droppedChunksCount += 1;
        continue;
      }

      // Deduplicate identical chunk bodies so overlapping/duplicate text doesn't waste context budget
      const hash = createHash('sha256').update(normalizedText).digest('hex');
      if (seenContentHashes.has(hash)) {
        droppedChunksCount += 1;
        continue;
      }

      const sourceLabel = `S${sources.length + 1}`;
      const section =
        chunk.headingPath.length > 0 ? ` | Section: ${chunk.headingPath.join(' > ')}` : '';
      const pageRange =
        chunk.pageEndNumber > chunk.pageNumber
          ? `Pages ${chunk.pageNumber}-${chunk.pageEndNumber}`
          : `Page ${chunk.pageNumber}`;

      const block = `[${sourceLabel}] Document: ${chunk.documentTitle} | ${pageRange}${section}\n${normalizedText}`;
      const blockTokens = this.tokenizer.countTokens(block);

      // Keep at least the #1 highest-scoring chunk (truncated safely if needed); drop others that overflow budget
      if (sources.length > 0 && usedTokens + blockTokens > maxContextTokens) {
        droppedChunksCount += 1;
        continue;
      }

      let finalBlock = block;
      let finalTokens = blockTokens;

      if (sources.length === 0 && blockTokens > maxContextTokens) {
        const encoded = this.tokenizer.encode(block);
        finalBlock = this.tokenizer.decode(encoded.slice(0, maxContextTokens)).trim();
        finalTokens = maxContextTokens;
      }

      seenContentHashes.add(hash);
      blocks.push(finalBlock);
      usedTokens += finalTokens;

      sources.push({
        sourceLabel,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        pageNumber: chunk.pageNumber,
        pageEndNumber: chunk.pageEndNumber,
        headingPath: chunk.headingPath,
        score: chunk.score,
        tokenCount: finalTokens,
        excerpt: normalizedText.slice(0, 240),
      });
    }

    return {
      formattedContext: blocks.join('\n\n---\n\n'),
      sources,
      totalContextTokens: usedTokens,
      droppedChunksCount,
    };
  }
}