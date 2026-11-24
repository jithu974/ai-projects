import { Redis } from 'ioredis';
import type { IHealthCheckable } from '../../domain/health.js';
import type { AppConfig } from '../../shared/config.js';

export class RedisClient implements IHealthCheckable {
  public readonly name = 'redis';
  public readonly client: Redis;

  constructor(config: AppConfig) {
    this.client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
      lazyConnect: true,
    });
    // Prevent unhandled 'error' event crashes when Redis temporarily drops
    this.client.on('error', () => {});
  }

  async checkHealth(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    const pong = await this.client.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${pong}`);
    }
  }

  async close(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}