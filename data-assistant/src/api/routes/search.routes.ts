import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { VectorSearchUseCase } from '../../application/vector-search.js';
import { SUPPORTED_MIME_TYPES } from '../../domain/document.js';

const searchHeadersSchema = z.object({
  'x-tenant-id': z.uuid(),
});

const vectorSearchBodySchema = z.object({
  query: z.string().trim().min(2).max(2000),
  topK: z.number().int().min(1).max(50).default(5),
  scoreThreshold: z.number().min(-1).max(1).optional(),
  filters: z
    .object({
      documentIds: z.array(z.uuid()).max(50).optional(),
      mimeTypes: z.array(z.enum(SUPPORTED_MIME_TYPES)).optional(),
      chunkTypes: z.array(z.enum(['text', 'table', 'list', 'code'])).optional(),
    })
    .optional(),
});

export function createSearchRoutes(
  vectorSearchUseCase: Pick<VectorSearchUseCase, 'execute'>,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/search/vector',
      {
        schema: {
          headers: searchHeadersSchema,
          body: vectorSearchBodySchema,
        },
      },
      async (request) => {
        const { query, topK, scoreThreshold, filters } = request.body;
        return vectorSearchUseCase.execute({
          tenantId: request.headers['x-tenant-id'],
          query,
          topK,
          scoreThreshold,
          documentIds: filters?.documentIds,
          mimeTypes: filters?.mimeTypes,
          chunkTypes: filters?.chunkTypes,
        });
      },
    );
  };
}