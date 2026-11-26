import type { IEmbeddingProvider } from '../../domain/embedding.js';
import type { AppConfig } from '../../shared/config.js';
import { DeterministicEmbeddingProvider } from './deterministic.embedding-provider.js';

export function createEmbeddingProvider(config: AppConfig): IEmbeddingProvider {
  switch (config.EMBEDDING_PROVIDER) {
    case 'deterministic':
      return new DeterministicEmbeddingProvider(
        config.EMBEDDING_MODEL,
        config.EMBEDDING_DIMENSIONS,
      );
  }
}