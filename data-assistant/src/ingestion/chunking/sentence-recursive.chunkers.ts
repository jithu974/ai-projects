import type { ChunkingOptions, DocumentChunk, IChunker, ITokenizer } from '../../domain/chunk.js';
import type { NormalizedDocument } from '../../domain/document.js';
import { createDocumentChunk, sliceOverlapTail, splitIntoSentences } from './helpers.js';

export class SentenceChunker implements IChunker {
  public readonly name = 'sentence' as const;

  constructor(private readonly tokenizer: ITokenizer) {}

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const page of doc.pages) {
      const sentences = splitIntoSentences(page.content);
      let current: string[] = [];
      let currentTokens = 0;

      for (const sentence of sentences) {
        const sTokens = this.tokenizer.countTokens(sentence);
        if (current.length > 0 && currentTokens + sTokens > options.targetTokens) {
          const text = current.join(' ');
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
          // Carry trailing whole sentences within overlap budget
          const carried: string[] = [];
          let carriedTokens = 0;
          for (let i = current.length - 1; i >= 0; i--) {
            const prev = current[i]!;
            const t = this.tokenizer.countTokens(prev);
            if (carriedTokens + t > options.overlapTokens) break;
            carried.unshift(prev);
            carriedTokens += t;
          }
          current = carried;
          currentTokens = carriedTokens;
        }
        current.push(sentence);
        currentTokens += sTokens;
      }

      if (current.length > 0) {
        chunks.push(
          createDocumentChunk({
            doc,
            tokenizer: this.tokenizer,
            strategyName: this.name,
            chunkIndex: chunks.length,
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            overlapTokens: options.overlapTokens,
            content: current.join(' '),
          }),
        );
      }
    }
    return chunks;
  }
}

export class RecursiveChunker implements IChunker {
  public readonly name = 'recursive' as const;
  private readonly separators = ['\n\n', '\n', '. ', ' '];

  constructor(private readonly tokenizer: ITokenizer) {}

  public splitTextRecursively(
    text: string,
    maxTokens: number,
    overlapTokens: number,
    sepIdx = 0,
  ): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (this.tokenizer.countTokens(trimmed) <= maxTokens) return [trimmed];

    const sep = this.separators[sepIdx];
    if (sep === undefined) {
      // Hard token fallback if a single unspaced string exceeds maxTokens
      const tokens = this.tokenizer.encode(trimmed);
      const out: string[] = [];
      const step = Math.max(1, maxTokens - Math.min(overlapTokens, maxTokens - 1));
      for (let i = 0; i < tokens.length; i += step) {
        const piece = this.tokenizer.decode(tokens.slice(i, i + maxTokens)).trim();
        if (piece) out.push(piece);
        if (i + maxTokens >= tokens.length) break;
      }
      return out;
    }

    const parts = trimmed.split(sep).filter((p) => p.trim().length > 0);
    if (parts.length <= 1) {
      return this.splitTextRecursively(trimmed, maxTokens, overlapTokens, sepIdx + 1);
    }

    const results: string[] = [];
    let buffer = '';

    for (const rawPart of parts) {
      const part = sep === '. ' && !rawPart.endsWith('.') ? `${rawPart}.` : rawPart;
      if (this.tokenizer.countTokens(part) > maxTokens) {
        if (buffer) {
          results.push(buffer.trim());
          buffer = '';
        }
        results.push(...this.splitTextRecursively(part, maxTokens, overlapTokens, sepIdx + 1));
        continue;
      }

      const candidate = buffer ? `${buffer}${sep === '. ' ? ' ' : sep}${part}` : part;
      if (this.tokenizer.countTokens(candidate) <= maxTokens) {
        buffer = candidate;
      } else {
        if (buffer) results.push(buffer.trim());
        const overlap = sliceOverlapTail(buffer, overlapTokens, this.tokenizer);
        buffer = overlap && this.tokenizer.countTokens(`${overlap}\n${part}`) <= maxTokens
          ? `${overlap}\n${part}`
          : part;
      }
    }

    if (buffer.trim()) results.push(buffer.trim());
    return results;
  }

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    for (const page of doc.pages) {
      const pieces = this.splitTextRecursively(
        page.content,
        options.targetTokens,
        options.overlapTokens,
      );
      for (const piece of pieces) {
        chunks.push(
          createDocumentChunk({
            doc,
            tokenizer: this.tokenizer,
            strategyName: this.name,
            chunkIndex: chunks.length,
            pageNumber: page.pageNumber,
            pageLabel: page.label,
            overlapTokens: options.overlapTokens,
            content: piece,
          }),
        );
      }
    }
    return chunks;
  }
}