import type { ChunkingOptions, DocumentChunk, IChunker, ITokenizer } from '../../domain/chunk.js';
import type { NormalizedDocument } from '../../domain/document.js';
import { createDocumentChunk, splitIntoSentences } from './helpers.js';
import { MarkdownAwareChunker } from './markdown-aware.chunker.js';
import { RecursiveChunker } from './sentence-recursive.chunkers.js';

export class ParentChildChunker implements IChunker {
  public readonly name = 'parent_child' as const;
  private readonly parentBuilder: MarkdownAwareChunker;
  private readonly childSplitter: RecursiveChunker;

  constructor(private readonly tokenizer: ITokenizer) {
    this.parentBuilder = new MarkdownAwareChunker(tokenizer);
    this.childSplitter = new RecursiveChunker(tokenizer);
  }

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    const parentTarget = options.parentTargetTokens ?? Math.max(options.targetTokens * 2, 800);
    const childTarget = options.childTargetTokens ?? Math.min(options.targetTokens, 200);
    const childOverlap = Math.min(options.overlapTokens, Math.floor(childTarget / 4));

    const rawParents = await this.parentBuilder.chunk(doc, {
      targetTokens: parentTarget,
      overlapTokens: 0,
    });

    const allChunks: DocumentChunk[] = [];

    for (const parent of rawParents) {
      const parentChunk: DocumentChunk = {
        ...parent,
        chunkLevel: 'parent',
        chunkIndex: allChunks.length,
        strategyName: this.name,
        metadata: { ...parent.metadata, strategy: this.name },
      };
      allChunks.push(parentChunk);

      // Keep small tables atomic as a single child linked to their parent
      const childPieces =
        parent.chunkType === 'table' && this.tokenizer.countTokens(parent.content) <= childTarget * 1.5
          ? [parent.content]
          : this.childSplitter.splitTextRecursively(parent.content, childTarget, childOverlap);

      for (const piece of childPieces) {
        allChunks.push(
          createDocumentChunk({
            doc,
            tokenizer: this.tokenizer,
            strategyName: this.name,
            chunkIndex: allChunks.length,
            pageNumber: parent.pageNumber,
            pageEndNumber: parent.pageEndNumber,
            pageLabel: parent.metadata.pageLabel,
            headingPath: parent.headingPath,
            chunkLevel: 'child',
            chunkType: parent.chunkType,
            parentChunkId: parentChunk.id,
            overlapTokens: childOverlap,
            content: piece,
          }),
        );
      }
    }

    return allChunks;
  }
}

export type SentenceEmbedder = (texts: string[]) => Promise<number[][]>;

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic chunker: splits where cosine similarity between adjacent sentences
 * drops below `similarityThreshold`. Wired to real embeddings in Phase 4.
 */
export class SemanticChunker implements IChunker {
  public readonly name = 'semantic' as const;

  constructor(
    private readonly tokenizer: ITokenizer,
    private readonly embed: SentenceEmbedder,
    private readonly similarityThreshold = 0.72,
  ) {}

  async chunk(doc: NormalizedDocument, options: ChunkingOptions): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const page of doc.pages) {
      const sentences = splitIntoSentences(page.content);
      if (sentences.length === 0) continue;

      const vectors = await this.embed(sentences);
      let current: string[] = [sentences[0]!];
      let currentTokens = this.tokenizer.countTokens(sentences[0]!);

      for (let i = 1; i < sentences.length; i++) {
        const sim = cosineSimilarity(vectors[i - 1] ?? [], vectors[i] ?? []);
        const nextTokens = this.tokenizer.countTokens(sentences[i]!);

        if (sim < this.similarityThreshold || currentTokens + nextTokens > options.targetTokens) {
          chunks.push(
            createDocumentChunk({
              doc,
              tokenizer: this.tokenizer,
              strategyName: this.name,
              chunkIndex: chunks.length,
              pageNumber: page.pageNumber,
              pageLabel: page.label,
              overlapTokens: 0,
              content: current.join(' '),
            }),
          );
          current = [sentences[i]!];
          currentTokens = nextTokens;
        } else {
          current.push(sentences[i]!);
          currentTokens += nextTokens;
        }
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
            overlapTokens: 0,
            content: current.join(' '),
          }),
        );
      }
    }
    return chunks;
  }
}