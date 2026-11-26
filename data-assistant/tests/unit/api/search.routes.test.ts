import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../src/api/server.js';
import type { VectorSearchUseCase } from '../../../src/application/vector-search.js';
import { loadConfig } from '../../../src/shared/config.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/data_assistant',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  QDRANT_URL: 'https://example.cloud.qdrant.io:6333',
});

describe('Vector search routes', () => {
  it('registers POST /api/v1/search/vector and forwards validated request data', async () => {
    const calls: Parameters<VectorSearchUseCase['execute']>[0][] = [];
    const vectorSearchUseCase: Pick<VectorSearchUseCase, 'execute'> = {
      async execute(request) {
        calls.push(request);
        return {
          query: request.query,
          model: 'test-model',
          dimensions: 2,
          embeddingCacheHit: false,
          latencyMs: 1,
          results: [],
        };
      },
    };
    const app = buildServer({ config, healthChecks: [], vectorSearchUseCase });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/search/vector',
      headers: { 'x-tenant-id': '11111111-1111-4111-8111-111111111111' },
      payload: { query: '  annual leave  ' },
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        query: 'annual leave',
        topK: 5,
        scoreThreshold: undefined,
        documentIds: undefined,
        mimeTypes: undefined,
        chunkTypes: undefined,
      },
    ]);

    await app.close();
  });
});
