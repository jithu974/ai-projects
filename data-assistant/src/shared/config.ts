import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  LOG_PRETTY: z.stringbool().default(false),

  DATABASE_URL: z.url(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  REDIS_URL: z.url(),

  QDRANT_URL: z.url(),
  QDRANT_API_KEY: optionalNonEmptyString,

  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(200).max(15000).default(2000),

  UPLOAD_STORAGE_DIR: z.string().min(1).default('./.data/uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(100).default(25),
  INGESTION_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
  INGESTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),

  // Phase 3 — Chunking
  CHUNKING_STRATEGY: z
    .enum(['fixed', 'token', 'sentence', 'recursive', 'markdown', 'parent_child'])
    .default('markdown'),
  CHUNK_TARGET_TOKENS: z.coerce.number().int().min(50).max(2000).default(400),
  CHUNK_OVERLAP_TOKENS: z.coerce.number().int().min(0).max(500).default(50),
  PARENT_CHUNK_TOKENS: z.coerce.number().int().min(200).max(4000).default(800),
  CHILD_CHUNK_TOKENS: z.coerce.number().int().min(50).max(800).default(200),
  TOKENIZER_CACHE_SIZE: z.coerce.number().int().min(0).max(100000).default(5000),

  // Phase 4 — Deterministic Embeddings & Qdrant
  EMBEDDING_PROVIDER: z.enum(['deterministic']).default('deterministic'),
  EMBEDDING_MODEL: z.string().min(1).default('deterministic-hash-v1'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(3072).default(384),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(256).default(32),
  EMBEDDING_MAX_RETRIES: z.coerce.number().int().min(0).max(8).default(3),
  EMBEDDING_CACHE_TTL_SEC: z.coerce.number().int().min(60).max(2_592_000).default(604_800),
  QDRANT_COLLECTION_ALIAS: z.string().min(1).default('chunks_live'),
  QDRANT_COLLECTION_PREFIX: z.string().min(1).default('chunks'),

  // Phase 5 — Free-Tier LLM & Basic RAG
  LLM_PROVIDER: z.enum(['gemini', 'groq', 'mock']).default('gemini'),
  LLM_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(512),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(6).default(2),
  GEMINI_API_KEY: optionalNonEmptyString,
  GROQ_API_KEY: optionalNonEmptyString,

  RAG_DEFAULT_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  RAG_MIN_SIMILARITY_SCORE: z.coerce.number().min(-1).max(1).default(0.15),
  RAG_MAX_CONTEXT_TOKENS: z.coerce.number().int().min(200).max(16_000).default(1800),
  RAG_EXPOSE_DEBUG_PROMPT: z.stringbool().default(true),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return Object.freeze(parsed.data);
}