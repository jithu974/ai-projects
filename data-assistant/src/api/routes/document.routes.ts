import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { IngestDocumentUseCase } from '../../application/ingest-document.js';
import { ValidationError } from '../../shared/errors.js';

const compareQuerySchema = z.object({
  strategy: z.enum(['fixed', 'token', 'sentence', 'recursive', 'markdown', 'parent_child']),
  targetTokens: z.coerce.number().int().min(50).max(2000).default(200),
});

export type DocumentIngestUseCase = Pick<
  IngestDocumentUseCase,
  'upload' | 'getDocumentStatus' | 'getDocumentChunks' | 'compareDocumentChunks'
>;

function requireTenantId(request: FastifyRequest): string {
  const tenantId = request.headers['x-tenant-id'];
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new ValidationError('The x-tenant-id header is required');
  }
  return tenantId.trim();
}

export function createDocumentRoutes(ingestUseCase: DocumentIngestUseCase): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { documentId: string } }>('/documents/:documentId', async (request) => {
      const tenantId = requireTenantId(request);

      return ingestUseCase.getDocumentStatus(tenantId, request.params.documentId);
    });

    app.get<{
      Params: { documentId: string };
      Querystring: { strategy?: string; targetTokens?: string };
    }>('/documents/:documentId/chunks/compare', async (request) => {
      const tenantId = requireTenantId(request);
      const query = compareQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError('Invalid chunk comparison query', query.error.issues);
      }

      return ingestUseCase.compareDocumentChunks(
        tenantId,
        request.params.documentId,
        query.data.strategy,
        query.data.targetTokens,
      );
    });

    app.get<{ Params: { documentId: string } }>(
      '/documents/:documentId/chunks',
      async (request) => {
        const tenantId = requireTenantId(request);
        return ingestUseCase.getDocumentChunks(tenantId, request.params.documentId);
      },
    );

    app.post('/documents', async (request, reply) => {
      const tenantId = requireTenantId(request);

      const file = await request.file();
      if (!file) {
        throw new ValidationError('A file must be included in the multipart request');
      }

      const result = await ingestUseCase.upload({
        tenantId,
        filename: file.filename,
        buffer: await file.toBuffer(),
      });

      return reply.code(result.deduplicated ? 200 : 202).send(result);
    });
  };
}
