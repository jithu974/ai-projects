import type { FastifyPluginAsync } from 'fastify';
import type { IngestDocumentUseCase } from '../../application/ingest-document.js';
import { ValidationError } from '../../shared/errors.js';

export type DocumentIngestUseCase = Pick<IngestDocumentUseCase, 'upload'>;

export function createDocumentRoutes(ingestUseCase: DocumentIngestUseCase): FastifyPluginAsync {
  return async (app) => {
    app.post('/documents', async (request, reply) => {
      const tenantId = request.headers['x-tenant-id'];
      if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
        throw new ValidationError('The x-tenant-id header is required');
      }

      const file = await request.file();
      if (!file) {
        throw new ValidationError('A file must be included in the multipart request');
      }

      const result = await ingestUseCase.upload({
        tenantId: tenantId.trim(),
        filename: file.filename,
        buffer: await file.toBuffer(),
      });

      return reply.code(result.deduplicated ? 200 : 202).send(result);
    });
  };
}
