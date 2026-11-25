import { z } from 'zod';

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
  QDRANT_API_KEY: z.string().min(1).optional(),

  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(200).max(15000).default(2000),

  UPLOAD_STORAGE_DIR: z.string().min(1).default('./.data/uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(100).default(25),
  INGESTION_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),
  INGESTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
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