import { describe, expect, it, vi } from 'vitest';
import type { IEmbeddingCache, IEmbeddingProvider } from '../../../src/domain/embedding.js';
import {
  decodeFloat32Vector,
  encodeFloat32Vector,
} from '../../../src/infrastructure/embeddings/embedding-cache.js';
import { EmbeddingService } from '../../../src/infrastructure/embeddings/embedding.service.js';

function createInMemoryCache(): IEmbeddingCache {
  const store = new Map<string, Buffer>();
  return {
    async getMany(keys) {
      return keys.map((k) => {
        const buf = store.get(k);
        return buf ? decodeFloat32Vector(buf) : null;
      });
    },
    async setMany(entries) {
      for (const e of entries) store.set(e.key, encodeFloat32Vector(e.vector));
    },
  };
}

describe('EmbeddingService (Batching, Float32 Cache & Retries)', () => {
  it('decodes Float32 vectors from unaligned buffers returned by Redis', () => {
    const encoded = encodeFloat32Vector([1.5, -2, 0.25]);
    const backing = new Uint8Array(encoded.byteLength + 1);
    backing.set(encoded, 1);
    const unaligned = Buffer.from(backing.buffer, 1, encoded.byteLength);

    expect(unaligned.byteOffset % 4).not.toBe(0);
    expect(decodeFloat32Vector(unaligned)).toEqual([1.5, -2, 0.25]);
  });

  it('batches requests, preserves order, and serves subsequent duplicates from Float32 cache', async () => {
    const embedBatch = vi.fn(async (texts: readonly string[]) => ({
      vectors: texts.map((t) => [t.length, 0.5, 0.25, 1.0]),
      model: 'test-model',
      dimensions: 4,
      totalTokens: texts.length * 10,
    }));

    const provider: IEmbeddingProvider = {
      providerName: 'mock',
      modelName: 'test-model',
      dimensions: 4,
      embedBatch,
    };

    const cache = createInMemoryCache();
    const service = new EmbeddingService(provider, cache, {
      batchSize: 2,
      maxRetries: 2,
      cacheTtlSeconds: 60,
      retryBaseDelayMs: 5,
    });

    // 5 items with batchSize 2 -> 3 provider calls (2 + 2 + 1)
    const first = await service.embedTexts(['a', 'bb', 'ccc', 'dddd', 'eeeee'], 'document');
    expect(embedBatch).toHaveBeenCalledTimes(3);
    expect(first.cacheHits).toBe(0);
    expect(first.cacheMisses).toBe(5);
    expect(first.vectors.map((v) => Math.round(v[0]!))).toEqual([1, 2, 3, 4, 5]);

    // Second call with 2 cached + 1 new -> only 1 miss sent to provider
    embedBatch.mockClear();
    const second = await service.embedTexts(['a', 'ffffff', 'ccc'], 'document');
    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(embedBatch).toHaveBeenCalledWith(['ffffff'], 'document');
    expect(second.cacheHits).toBe(2);
    expect(second.cacheMisses).toBe(1);
    expect(second.vectors.map((v) => Math.round(v[0]!))).toEqual([1, 6, 3]);
  });

  it('retries transient HTTP 429 rate-limit errors and recovers', async () => {
    let calls = 0;
    const provider: IEmbeddingProvider = {
      providerName: 'mock',
      modelName: 'test-model',
      dimensions: 2,
      embedBatch: vi.fn(async (texts) => {
        calls += 1;
        if (calls < 3) {
          const err = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
          throw err;
        }
        return { vectors: texts.map(() => [0.6, 0.8]), model: 'test-model', dimensions: 2 };
      }),
    };

    const service = new EmbeddingService(provider, null, {
      batchSize: 10,
      maxRetries: 3,
      cacheTtlSeconds: 60,
      retryBaseDelayMs: 5,
    });

    const res = await service.embedTexts(['annual leave'], 'query');
    expect(calls).toBe(3);
    expect(res.vectors).toEqual([[0.6, 0.8]]);
  });

  it('fails fast on HTTP 401 unauthorized without wasting retries', async () => {
    const embedBatch = vi.fn(async () => {
      throw Object.assign(new Error('Invalid API key'), { status: 401 });
    });

    const provider: IEmbeddingProvider = {
      providerName: 'mock',
      modelName: 'test-model',
      dimensions: 2,
      embedBatch,
    };

    const service = new EmbeddingService(provider, null, {
      batchSize: 10,
      maxRetries: 3,
      cacheTtlSeconds: 60,
      retryBaseDelayMs: 5,
    });

    await expect(service.embedTexts(['annual leave'], 'query')).rejects.toThrow(/Invalid API key/);
    expect(embedBatch).toHaveBeenCalledTimes(1);
  });
});