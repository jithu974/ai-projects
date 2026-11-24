import { buildServer } from './api/server.js';
import { RedisClient } from './infrastructure/cache/redis.js';
import { PostgresClient } from './infrastructure/db/migrate.js';
import { QdrantVectorClient } from './infrastructure/vector/qdrant.js';
import { loadConfig } from './shared/config.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const postgres = new PostgresClient(config);
  const redis = new RedisClient(config);
  const qdrant = new QdrantVectorClient(config);

  const app = buildServer({
    config,
    healthChecks: [postgres, redis, qdrant],
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Graceful shutdown initiated');
    try {
      await app.close();
      await Promise.allSettled([postgres.close(), redis.close()]);
      app.log.info('All connections closed cleanly');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});