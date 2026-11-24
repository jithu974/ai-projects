import { QdrantClient } from '@qdrant/js-client-rest';
import type { IHealthCheckable } from '../../domain/health.js';
import type { AppConfig } from '../../shared/config.js';

export class QdrantVectorClient implements IHealthCheckable {
  public readonly name = 'qdrant';
  public readonly client: QdrantClient;

  constructor(config: AppConfig) {
    this.client = new QdrantClient({
      url: config.QDRANT_URL,
      ...(config.QDRANT_API_KEY ? { apiKey: config.QDRANT_API_KEY } : {}),
      timeout: config.HEALTH_CHECK_TIMEOUT_MS,
    });
  }

  async checkHealth(): Promise<void> {
    await this.client.getCollections();
  }
}