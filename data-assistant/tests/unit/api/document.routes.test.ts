import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../src/api/server.js';
import type { IngestDocumentUseCase } from '../../../src/application/ingest-document.js';
import type { DocumentIngestUseCase } from '../../../src/api/routes/document.routes.js';
import { loadConfig } from '../../../src/shared/config.js';

type DocumentStatus = Awaited<ReturnType<IngestDocumentUseCase['getDocumentStatus']>>;
type StoredChunks = Awaited<ReturnType<IngestDocumentUseCase['getDocumentChunks']>>;
type ChunkComparison = Awaited<ReturnType<IngestDocumentUseCase['compareDocumentChunks']>>;

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/data_assistant',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  QDRANT_URL: 'https://example.cloud.qdrant.io:6333',
});

const statusResult: DocumentStatus = {
  document: {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId: '11111111-1111-4111-8111-111111111111',
    title: 'Annual Leave Policy',
    originalFilename: 'hr-policy.md',
    mimeType: 'text/markdown',
    currentVersionId: '33333333-3333-4333-8333-333333333333',
    status: 'PARSED',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  },
  version: {
    id: '33333333-3333-4333-8333-333333333333',
    versionNumber: 1,
    sha256Hash: 'abc123',
    fileSizeBytes: 64,
    parserName: 'markdown',
    pageCount: null,
    charCount: 64,
    status: 'PARSED',
  },
  latestJob: {
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: '11111111-1111-4111-8111-111111111111',
    documentId: '22222222-2222-4222-8222-222222222222',
    documentVersionId: '33333333-3333-4333-8333-333333333333',
    bullJobId: 'ingest-job',
    state: 'COMPLETED',
    attempts: 1,
    errorCode: null,
    errorDetail: null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    finishedAt: new Date('2026-01-01T00:00:01Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
};

const storedChunks: StoredChunks = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    chunkLevel: 'standard',
    chunkType: 'text',
    pageNumber: 1,
    headingPath: ['Annual Leave Policy'],
    tokenCount: 12,
    content: 'Employees receive 30 days of leave.',
    contextualContent: 'Annual Leave Policy\nEmployees receive 30 days of leave.',
    metadata: {
      documentTitle: 'Annual Leave Policy',
      strategy: 'markdown',
    },
  },
];

const chunkComparison: ChunkComparison = {
  chunks: [],
  quality: {
    passed: true,
    totalChunks: 0,
    errorCount: 0,
    warningCount: 0,
    issues: [],
  },
};

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
      async getDocumentStatus() {
        return statusResult;
      },
      async getDocumentChunks() {
        return storedChunks;
      },
      async compareDocumentChunks() {
        return chunkComparison;
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

  it('returns document status at GET /api/v1/documents/:documentId', async () => {
    const lookups: Array<{ tenantId: string; documentId: string }> = [];
    const ingestUseCase: DocumentIngestUseCase = {
      async upload() {
        throw new Error('Upload should not be called by the status route');
      },
      async getDocumentStatus(tenantId, documentId) {
        lookups.push({ tenantId, documentId });
        return statusResult;
      },
      async getDocumentChunks() {
        return storedChunks;
      },
      async compareDocumentChunks() {
        return chunkComparison;
      },
    };
    const app = buildServer({ config, healthChecks: [], ingestUseCase });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/22222222-2222-4222-8222-222222222222',
      headers: { 'x-tenant-id': '11111111-1111-4111-8111-111111111111' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      version: { status: 'PARSED' },
      latestJob: { state: 'COMPLETED' },
    });
    expect(lookups).toEqual([
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
      },
    ]);

    await app.close();
  });

  it('returns stored active chunks for the tenant and document', async () => {
    const app = buildServer({
      config,
      healthChecks: [],
      ingestUseCase: {
        async upload() {
          throw new Error('Upload should not be called by chunk inspection routes');
        },
        async getDocumentStatus() {
          return statusResult;
        },
        async getDocumentChunks(tenantId, documentId) {
          expect(tenantId).toBe('11111111-1111-4111-8111-111111111111');
          expect(documentId).toBe('22222222-2222-4222-8222-222222222222');
          return storedChunks;
        },
        async compareDocumentChunks() {
          return chunkComparison;
        },
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/22222222-2222-4222-8222-222222222222/chunks',
      headers: { 'x-tenant-id': '11111111-1111-4111-8111-111111111111' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(storedChunks);

    await app.close();
  });

  it('compares a requested chunking strategy and validates query parameters', async () => {
    const comparisons: Array<{
      tenantId: string;
      documentId: string;
      strategy: string;
      targetTokens: number;
    }> = [];
    const app = buildServer({
      config,
      healthChecks: [],
      ingestUseCase: {
        async upload() {
          throw new Error('Upload should not be called by chunk comparison routes');
        },
        async getDocumentStatus() {
          return statusResult;
        },
        async getDocumentChunks() {
          return storedChunks;
        },
        async compareDocumentChunks(tenantId, documentId, strategy, targetTokens) {
          comparisons.push({ tenantId, documentId, strategy, targetTokens });
          return chunkComparison;
        },
      },
    });
    const headers = { 'x-tenant-id': '11111111-1111-4111-8111-111111111111' };

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/22222222-2222-4222-8222-222222222222/chunks/compare?strategy=markdown&targetTokens=200',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      chunks: [],
      quality: { passed: true, totalChunks: 0 },
    });
    expect(comparisons).toEqual([
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
        strategy: 'markdown',
        targetTokens: 200,
      },
    ]);

    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/22222222-2222-4222-8222-222222222222/chunks/compare?strategy=semantic',
      headers,
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(comparisons).toHaveLength(1);

    await app.close();
  });
});
