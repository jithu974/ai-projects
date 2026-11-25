import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { IHealthCheckable } from '../../domain/health.js';
import type { AppConfig } from '../../shared/config.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export class PostgresClient implements IHealthCheckable {
  public readonly name = 'postgres';
  public readonly pool: Pool;
  public readonly db: Database;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: config.DB_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async checkHealth(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}