import { describe, expect, it } from 'vitest';
import { DeterministicEmbeddingProvider } from '../../../src/infrastructure/embeddings/deterministic.embedding-provider.js';

function cosine(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}

describe('DeterministicEmbeddingProvider', () => {
  const provider = new DeterministicEmbeddingProvider('deterministic-hash-v1', 384);

  it('produces identical L2-normalized 384-dim vectors for identical text', async () => {
    const res1 = await provider.embedBatch(['Annual leave policy for employees'], 'document');
    const res2 = await provider.embedBatch(['Annual leave policy for employees'], 'query');

    const v1 = res1.vectors[0]!;
    const v2 = res2.vectors[0]!;
    expect(v1).toHaveLength(384);
    expect(v1).toEqual(v2);

    const norm = Math.sqrt(v1.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('ranks lexical & subword-overlapping chunks higher than unrelated chunks', async () => {
    const { vectors } = await provider.embedBatch(
      [
        'contractor leave eligibility',                 // query
        'External contractors are excluded from leave', // morphological + lexical match
        'Ergonomic office monitor hardware stipend',    // unrelated
      ],
      'document',
    );

    const simRelevant = cosine(vectors[0]!, vectors[1]!);
    const simUnrelated = cosine(vectors[0]!, vectors[2]!);
    expect(simRelevant).toBeGreaterThan(simUnrelated);
    expect(simRelevant).toBeGreaterThan(0.2);
  });
});