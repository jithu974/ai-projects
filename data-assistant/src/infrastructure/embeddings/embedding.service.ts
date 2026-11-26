import { createHash } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type {
  EmbeddingInputType,
  IEmbeddingCache,
  IEmbeddingProvider,
} from '../../domain/embedding.js';
import { isHttpTransientError, withRetry } from '../../shared/retry.js';

export interface EmbedExecutionResult {
  vectors: number[][];
  model: string;
  dimensions: number;
  cacheHits: number;
  cacheMisses: number;
  totalTokens: number;
}

export class EmbeddingService {
  constructor(
    private readonly provider: IEmbeddingProvider,
    private readonly cache: IEmbeddingCache | null,
    private readonly options: {
      batchSize: number;
      maxRetries: number;
      cacheTtlSeconds: number;
      retryBaseDelayMs?: number;
    },
    private readonly logger?: FastifyBaseLogger,
  ) {}

  get modelName(): string {
    return this.provider.modelName;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }

  private buildCacheKey(text: string, inputType: EmbeddingInputType): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `emb:${this.provider.providerName}:${this.provider.modelName}:${this.provider.dimensions}:${inputType}:${hash}`;
  }

  async embedTexts(
    texts: readonly string[],
    inputType: EmbeddingInputType,
  ): Promise<EmbedExecutionResult> {
    if (texts.length === 0) {
      return {
        vectors: [],
        model: this.provider.modelName,
        dimensions: this.provider.dimensions,
        cacheHits: 0,
        cacheMisses: 0,
        totalTokens: 0,
      };
    }

    const keys = texts.map((t) => this.buildCacheKey(t, inputType));
    const cached = this.cache ? await this.cache.getMany(keys) : keys.map(() => null);

    const finalVectors: (number[] | null)[] = [...cached];
    const missIndices: number[] = [];
    for (let i = 0; i < finalVectors.length; i++) {
      if (finalVectors[i] === null) missIndices.push(i);
    }

    let totalTokens = 0;
    const toCache: { key: string; vector: number[] }[] = [];

    // Process only cache misses in bounded batches
    for (let start = 0; start < missIndices.length; start += this.options.batchSize) {
      const batchIndices = missIndices.slice(start, start + this.options.batchSize);
      const batchTexts = batchIndices.map((idx) => texts[idx]!);

      const batchResult = await withRetry(
        () => this.provider.embedBatch(batchTexts, inputType),
        {
          maxRetries: this.options.maxRetries,
          baseDelayMs: this.options.retryBaseDelayMs ?? 500,
          isRetryable: isHttpTransientError,
          onRetry: (attempt, delayMs, err) => {
            this.logger?.warn(
              {
                provider: this.provider.providerName,
                attempt,
                delayMs,
                err: err instanceof Error ? err.message : String(err),
              },
              'Retrying transient embedding provider failure',
            );
          },
        },
      );

      totalTokens += batchResult.totalTokens ?? 0;

      for (let i = 0; i < batchIndices.length; i++) {
        const vector = batchResult.vectors[i];
        if (!vector || vector.length !== this.provider.dimensions) {
          throw new Error(
            `Invalid embedding dimension from ${this.provider.providerName}: expected ${this.provider.dimensions}, got ${vector?.length ?? 0}`,
          );
        }
        const originalIndex = batchIndices[i]!;
        finalVectors[originalIndex] = vector;
        toCache.push({ key: keys[originalIndex]!, vector });
      }
    }

    if (this.cache && toCache.length > 0) {
      await this.cache.setMany(toCache, this.options.cacheTtlSeconds).catch((err) => {
        // Cache write errors should never fail document indexing
        this.logger?.warn({ err }, 'Failed to populate Redis embedding cache');
      });
    }

    return {
      vectors: finalVectors as number[][],
      model: this.provider.modelName,
      dimensions: this.provider.dimensions,
      cacheHits: texts.length - missIndices.length,
      cacheMisses: missIndices.length,
      totalTokens,
    };
  }
}