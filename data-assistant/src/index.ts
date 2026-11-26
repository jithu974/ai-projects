import { buildServer } from './api/server.js';
import { IngestDocumentUseCase } from './application/ingest-document.js';
import { VectorSearchUseCase } from './application/vector-search.js';
import { RedisClient } from './infrastructure/cache/redis.js';
import { PostgresClient } from './infrastructure/db/client.js';
import { RedisEmbeddingCache } from './infrastructure/embeddings/embedding-cache.js';
import { EmbeddingService } from './infrastructure/embeddings/embedding.service.js';
import { createEmbeddingProvider } from './infrastructure/embeddings/provider-factory.js';
import { IngestionQueue, IngestionWorker } from './infrastructure/queue/ingestion.queue.js';
import { LocalDiskObjectStorage } from './infrastructure/storage/local-disk-storage.js';
import { QdrantVectorStore } from './infrastructure/vector/qdrant-vector-store.js';
import { QdrantVectorClient } from './infrastructure/vector/qdrant.js';
import { ChunkerRegistry } from './ingestion/chunking/chunker-registry.js';
import { Cl100kTokenizer } from './ingestion/chunking/tokenizer.js';
import { ParserRegistry } from './ingestion/parsers/parser-registry.js';
import { loadConfig } from './shared/config.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Infrastructure adapters
  const postgres = new PostgresClient(config);
  const redis = new RedisClient(config);
  const qdrant = new QdrantVectorClient(config);
  const storage = new LocalDiskObjectStorage(config.UPLOAD_STORAGE_DIR);
  const parserRegistry = ParserRegistry.createDefault();
  const tokenizer = new Cl100kTokenizer(config.TOKENIZER_CACHE_SIZE);
  const chunkerRegistry = ChunkerRegistry.createDefault(tokenizer);
  const ingestionQueue = new IngestionQueue(config);

  // Phase 4: Zero-cost deterministic embedding service + Qdrant Cloud Free Tier
  const embeddingProvider = createEmbeddingProvider(config);
  const embeddingCache = new RedisEmbeddingCache(redis.client);
  const vectorStore = new QdrantVectorStore(
    qdrant.client,
    config.QDRANT_COLLECTION_ALIAS,
    config.QDRANT_COLLECTION_PREFIX,
  );

  // Ensure Qdrant collection, tenant payload index, and live alias match configured dims (384)
  const physicalCollection = await vectorStore.ensureReady(
    embeddingProvider.modelName,
    embeddingProvider.dimensions,
  );

  const maxUploadBytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  const ingestUseCase = new IngestDocumentUseCase(
    postgres.db,
    storage,
    ingestionQueue,
    maxUploadBytes,
    chunkerRegistry,
    config,
  );

  // Build server first so we can share structured logger with services/worker
  let vectorSearchUseCase!: VectorSearchUseCase;
  const embeddingService = new EmbeddingService(
    embeddingProvider,
    embeddingCache,
    {
      batchSize: config.EMBEDDING_BATCH_SIZE,
      maxRetries: config.EMBEDDING_MAX_RETRIES,
      cacheTtlSeconds: config.EMBEDDING_CACHE_TTL_SEC,
    },
  );
  vectorSearchUseCase = new VectorSearchUseCase(embeddingService, vectorStore, postgres.db);

  const serverDependencies = {
    config,
    healthChecks: [postgres, redis, qdrant],
    ingestUseCase,
    vectorSearchUseCase,
  };
  const app = buildServer(serverDependencies);

  app.log.info(
    {
      provider: embeddingProvider.providerName,
      model: embeddingProvider.modelName,
      dimensions: embeddingProvider.dimensions,
      qdrantCollection: physicalCollection,
      qdrantAlias: config.QDRANT_COLLECTION_ALIAS,
    },
    'Vector storage initialized',
  );

  const worker = new IngestionWorker({
    config,
    db: postgres.db,
    storage,
    parserRegistry,
    chunkerRegistry,
    embeddingService,
    vectorStore,
    logger: app.log.child({ component: 'ingestion-worker' }),
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Graceful shutdown initiated');
    try {
      await app.close();
      await worker.close();
      await ingestionQueue.close();
      await Promise.allSettled([postgres.close(), redis.close()]);
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