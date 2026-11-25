import type { ChunkingStrategyName, IChunker, ITokenizer } from '../../domain/chunk.js';
import { ValidationError } from '../../shared/errors.js';
import { FixedSizeChunker, TokenChunker } from './fixed-token.chunkers.js';
import { MarkdownAwareChunker } from './markdown-aware.chunker.js';
import { ParentChildChunker } from './parent-child-sematic.chunkers.js';
import { RecursiveChunker, SentenceChunker } from './sentence-recursive.chunkers.js';

export class ChunkerRegistry {
  private readonly chunkers = new Map<ChunkingStrategyName, IChunker>();

  constructor(chunkers: readonly IChunker[]) {
    for (const c of chunkers) this.chunkers.set(c.name, c);
  }

   getChunker(name: ChunkingStrategyName): IChunker {
    const chunker = this.chunkers.get(name);
    if (!chunker) {
      throw new ValidationError(`Unsupported chunking strategy: "${name}"`);
    }
    return chunker;
  }

  static createDefault(tokenizer: ITokenizer): ChunkerRegistry {
    return new ChunkerRegistry([
      new FixedSizeChunker(tokenizer),
      new TokenChunker(tokenizer),
      new SentenceChunker(tokenizer),
      new RecursiveChunker(tokenizer),
      new MarkdownAwareChunker(tokenizer),
      new ParentChildChunker(tokenizer),
    ]);
  }
}