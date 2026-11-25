import { describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import type { DocumentIngestUseCase } from '../../src/api/routes/document.routes.js';
import { loadConfig } from '../../src/shared/config.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/data_assistant',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  QDRANT_URL: 'https://example.cloud.qdrant.io:6333',
});

describe('Document routes', () => {
  it('accepts a multipart upload at POST /api/v1/documents', async () => {
    const uploads: Array<{ tenantId: string; filename: string; buffer: Buffer }> = [];
    const ingestUseCase: DocumentIngestUseCase = {
      async upload(params) {
        uploads.push(params);
        return {
          deduplicated: false,
          documentId: '22222222-2222-4222-8222-222222222222',
          versionId: '33333333-3333-4333-8333-333333333333',
          jobId: '44444444-4444-4444-8444-444444444444',
          status: 'PENDING',
          sha256Hash: 'abc123',
        };
      },
    };
    const app = buildServer({ config, healthChecks: [], ingestUseCase });
    const boundary = 'policy-upload-boundary';
    const content = '# Annual Leave Policy\n\nEmployees receive 30 days of leave.\n';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="hr-policy.md"',
      'Content-Type: text/markdown',
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-tenant-id': '11111111-1111-4111-8111-111111111111',
      },
      payload,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      documentId: '22222222-2222-4222-8222-222222222222',
      status: 'PENDING',
    });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      tenantId: '11111111-1111-4111-8111-111111111111',
      filename: 'hr-policy.md',
      buffer: Buffer.from(content),
    });

    await app.close();
  });
});
