import { describe, expect, it } from 'vitest';
import {
  buildPhysicalCollectionName,
  buildQdrantFilter,
} from '../../../src/infrastructure/vector/qdrant-vector-store.js';

describe('Qdrant Filter & Collection Naming', () => {
  it('always enforces mandatory tenant_id and is_active filters', () => {
    const filter = buildQdrantFilter({
      tenantId: '11111111-1111-4111-8111-111111111111',
      chunkTypes: ['table'],
    });

    expect(filter.must).toEqual([
      { key: 'tenant_id', match: { value: '11111111-1111-4111-8111-111111111111' } },
      { key: 'is_active', match: { value: true } },
      { key: 'chunk_type', match: { any: ['table'] } },
    ]);
  });

  it('builds deterministic model-versioned physical collection names', () => {
    expect(buildPhysicalCollectionName('chunks', 'text-embedding-3-small', 1536)).toBe(
      'chunks_text_embedding_3_small_1536',
    );
  });
});