import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/shared/config.js';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/data_assistant',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  QDRANT_URL: 'https://example.cloud.qdrant.io:6333',
  QDRANT_API_KEY: 'test-key',
};

describe('loadConfig', () => {
  it('parses valid environment variables and applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.DB_POOL_MAX).toBe(5);
    expect(config.LOG_PRETTY).toBe(false);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('throws a clear aggregated error when required URLs are missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/QDRANT_URL/);
  });

  it('coerces LOG_PRETTY via Zod v4 stringbool', () => {
    const config = loadConfig({ ...validEnv, LOG_PRETTY: 'true' });
    expect(config.LOG_PRETTY).toBe(true);
  });
});