import type { ChunkingOptions, DocumentChunk, IChunker, ITokenizer } from '../../domain/chunk.js';
import type { NormalizedDocument } from '../../domain/document.js';
import { createDocumentChunk } from './helpers.js';

export class FixedSizeChunker implements IChunker {
  public readonly name = 'fixed' as const;

  constructor(private readonly tokenizer: ITokenizer) {}

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    // Approximate 4 chars/token so options stay comparable across strategies
    const windowChars = Math.max(80, options.targetTokens * 4);
    const overlapChars = Math.min(Math.floor(windowChars / 2), options.overlapTokens * 4);
    const step = Math.max(1, windowChars - overlapChars);

    const chunks: DocumentChunk[] = [];
    for (const page of doc.pages) {
      for (let start = 0; start < page.content.length; start += step) {
        const slice = page.content.slice(start, start + windowChars).trim();
        if (!slice) continue;
        chunks.push(
          createDocumentChunk({
            doc,
            tokenizer: this.tokenizer,
            strategyName: this.name,
            chunkIndex: chunks.length,
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            overlapTokens: options.overlapTokens,
            content: slice,
          }),
        );
        if (start + windowChars >= page.content.length) break;
      }
    }
    return chunks;
  }
}

export class TokenChunker implements IChunker {
  public readonly name = 'token' as const;

  constructor(private readonly tokenizer: ITokenizer) {}

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    const step = Math.max(1, options.targetTokens - Math.min(options.overlapTokens, options.targetTokens - 1));
    const chunks: DocumentChunk[] = [];

    for (const page of doc.pages) {
      const tokens = this.tokenizer.encode(page.content);
      for (let start = 0; start < tokens.length; start += step) {
        const text = this.tokenizer.decode(tokens.slice(start, start + options.targetTokens)).trim();
        if (!text) continue;
        chunks.push(
          createDocumentChunk({
            doc,
            tokenizer: this.tokenizer,
            strategyName: this.name,
            chunkIndex: chunks.length,
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            overlapTokens: options.overlapTokens,
            content: text,
          }),
        );
        if (start + options.targetTokens >= tokens.length) break;
      }
    }
    return chunks;
  }
}