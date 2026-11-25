import { buildServer } from './api/server.js';
import { IngestDocumentUseCase } from './application/ingest-document.js';
import { RedisClient } from './infrastructure/cache/redis.js';
import { PostgresClient } from './infrastructure/db/migrate.js';
import { IngestionQueue, IngestionWorker } from './infrastructure/queue/ingestion.queue.js';
import { LocalDiskObjectStorage } from './infrastructure/storage/local-disk-storage.js';
import { QdrantVectorClient } from './infrastructure/vector/qdrant.js';
import { ParserRegistry } from './ingestion/parsers/parser-registry.js';
import { loadConfig } from './shared/config.js';
import { ChunkerRegistry } from './ingestion/chunking/chunker-registry.js';
import { Cl100kTokenizer } from './ingestion/chunking/tokenizer.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const postgres = new PostgresClient(config);
  const redis = new RedisClient(config);
  const qdrant = new QdrantVectorClient(config);
  const storage = new LocalDiskObjectStorage(config.UPLOAD_STORAGE_DIR);
  const parserRegistry = ParserRegistry.createDefault();
  const queue = new IngestionQueue(config);
  const tokenizer = new Cl100kTokenizer(config.TOKENIZER_CACHE_SIZE);
  const chunkerRegistry = ChunkerRegistry.createDefault(tokenizer);
  const ingestUseCase = new IngestDocumentUseCase(
    postgres.db,
    storage,
    queue,
    config.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    chunkerRegistry,
    config,
  );

  const app = buildServer({
    config,
    healthChecks: [postgres, redis, qdrant],
    ingestUseCase,
  });
  const worker = new IngestionWorker({
    config,
    db: postgres.db,
    storage,
    parserRegistry,
    logger: app.log,
    chunkerRegistry: chunkerRegistry,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Graceful shutdown initiated');

    let shutdownFailed = false;
    const closeSteps = [
      ['server', () => app.close()],
      ['worker', () => worker.close()],
      ['queue', () => queue.close()],
    ] as const;

    for (const [resource, close] of closeSteps) {
      try {
        await close();
      } catch (err) {
        shutdownFailed = true;
        app.log.error({ err, resource }, 'Failed to close resource');
      }
    }

    const dependencyCloseResults = await Promise.allSettled([
      postgres.close(),
      redis.close(),
    ]);
    for (const [index, result] of dependencyCloseResults.entries()) {
      if (result.status === 'rejected') {
        shutdownFailed = true;
        const resource = index === 0 ? 'postgres' : 'redis';
        app.log.error({ err: result.reason, resource }, 'Failed to close resource');
      }
    }

    if (shutdownFailed) {
      process.exit(1);
    }

    app.log.info('All connections closed cleanly');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});