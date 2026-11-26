export type EmbeddingInputType = 'document' | 'query';

export interface EmbeddingBatchResult {
  vectors: number[][];
  model: string;
  dimensions: number;
  totalTokens?: number | undefined;
}

export interface IEmbeddingProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly dimensions: number;
  embedBatch(texts: readonly string[], inputType: EmbeddingInputType): Promise<EmbeddingBatchResult>;
}

export interface IEmbeddingCache {
  getMany(keys: readonly string[]): Promise<(number[] | null)[]>;
  setMany(entries: readonly { key: string; vector: number[] }[], ttlSeconds: number): Promise<void>;
}