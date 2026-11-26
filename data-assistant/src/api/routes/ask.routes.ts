import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AskQuestionUseCase } from '../../application/ask-question.js';
import { SUPPORTED_MIME_TYPES } from '../../domain/document.js';

const askHeadersSchema = z.object({
  'x-tenant-id': z.uuid(),
});

const askBodySchema = z.object({
  question: z.string().trim().min(3).max(2000),
  topK: z.number().int().min(1).max(20).optional(),
  scoreThreshold: z.number().min(-1).max(1).optional(),
  filters: z
    .object({
      documentIds: z.array(z.uuid()).max(50).optional(),
      mimeTypes: z.array(z.enum(SUPPORTED_MIME_TYPES)).optional(),
      chunkTypes: z.array(z.enum(['text', 'table', 'list', 'code'])).optional(),
    })
    .optional(),
  includeDebug: z.boolean().optional(),
});

export function createAskRoutes(askQuestionUseCase: AskQuestionUseCase): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/ask',
      {
        schema: {
          headers: askHeadersSchema,
          body: askBodySchema,
        },
      },
      async (request) => {
        const { question, topK, scoreThreshold, filters, includeDebug } = request.body;
        return askQuestionUseCase.execute({
          tenantId: request.headers['x-tenant-id'],
          question,
          topK,
          scoreThreshold,
          filters,
          includeDebug,
        });
      },
    );
  };
}