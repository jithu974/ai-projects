import { describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { IHealthCheckable } from '../../src/domain/health.js';
import { loadConfig } from '../../src/shared/config.js';

const testConfig = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/data_assistant',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  QDRANT_URL: 'https://example.cloud.qdrant.io:6333',
  HEALTH_CHECK_TIMEOUT_MS: '250',
});

const healthyDep = (name: string): IHealthCheckable => ({
  name,
  async checkHealth() {},
});

const failingDep = (name: string): IHealthCheckable => ({
  name,
  async checkHealth() {
    throw new Error('connection refused');
  },
});

describe('Health & Readiness Endpoints', () => {
  it('GET /health returns 200 without calling dependencies', async () => {
    const app = buildServer({ config: testConfig, healthChecks: [failingDep('postgres')] });
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.json()).toMatchObject({ status: 'ok', service: 'data-assistant' });
    await app.close();
  });

  it('GET /ready returns 200 when all dependencies are healthy', async () => {
    const app = buildServer({
      config: testConfig,
      healthChecks: [healthyDep('postgres'), healthyDep('redis'), healthyDep('qdrant')],
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ready');
    await app.close();
  });

  it('GET /ready returns 503 when any dependency fails', async () => {
    const app = buildServer({
      config: testConfig,
      healthChecks: [healthyDep('postgres'), failingDep('qdrant')],
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('not_ready');
    expect(body.dependencies.find((d: { name: string }) => d.name === 'qdrant')).toMatchObject({
      status: 'down',
      error: 'connection refused',
    });
    await app.close();
  });
});