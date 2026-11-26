import { createHash } from 'node:crypto';
import type {
  EmbeddingBatchResult,
  EmbeddingInputType,
  IEmbeddingProvider,
} from '../../domain/embedding.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the',
  'this', 'to', 'was', 'were', 'will', 'with',
]);

/**
 * Deterministic, offline, $0 embedding provider using signed feature hashing
 * (words + bigrams + 4-char subword shingles) and L2 unit normalization.
 *
 * Trade-off: Reproducible and zero-cost for architecture, caching, Qdrant filtering,
 * and CI wiring tests, but carries NO neural semantic understanding of synonyms.
 */
export class DeterministicEmbeddingProvider implements IEmbeddingProvider {
  public readonly providerName = 'deterministic';

  constructor(
    public readonly modelName = 'deterministic-hash-v1',
    public readonly dimensions = 384,
  ) {}

  async embedBatch(
    texts: readonly string[],
    _inputType: EmbeddingInputType,
  ): Promise<EmbeddingBatchResult> {
    const vectors = texts.map((text) => this.hashToUnitVector(text));
    return {
      vectors,
      model: this.modelName,
      dimensions: this.dimensions,
      totalTokens: 0,
    };
  }

  private addFeature(vec: Float64Array, feature: string, weight: number): void {
    const digest = createHash('sha256').update(feature).digest();
    const bucket = digest.readUInt32BE(0) % this.dimensions;
    // Signed hashing (+weight / -weight) prevents hash collisions from biasing positive
    const sign = ((digest[4] ?? 0) & 1) === 0 ? 1 : -1;
    vec[bucket] = (vec[bucket] ?? 0) + sign * weight;
  }

  private hashToUnitVector(text: string): number[] {
    const vec = new Float64Array(this.dimensions);
    const rawTokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

    for (let i = 0; i < rawTokens.length; i++) {
      const token = rawTokens[i]!;
      // 1. Exact word feature (highest weight)
      this.addFeature(vec, `w:${token}`, 2.0);

      // 2. Word bigram feature for phrase order ("annual_leave")
      const next = rawTokens[i + 1];
      if (next) {
        this.addFeature(vec, `b:${token}_${next}`, 1.25);
      }

      // 3. 4-char subword shingles so plurals/stems share buckets (e.g., contractor/contractors)
      if (token.length >= 5) {
        for (let j = 0; j <= token.length - 4; j++) {
          this.addFeature(vec, `c:${token.slice(j, j + 4)}`, 0.4);
        }
      }
    }

    // L2 unit normalization so Cosine, Dot Product, and Euclidean rankings align
    let normSq = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const v = vec[i] ?? 0;
      normSq += v * v;
    }

    const norm = Math.sqrt(normSq);
    if (norm === 0) {
      vec[0] = 1;
      return Array.from(vec);
    }

    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
    return Array.from(vec);
  }
}