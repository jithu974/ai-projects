import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CheckReadinessUseCase } from '../../application/check-readiness.js';

const dependencyResultSchema = z.object({
  name: z.string(),
  status: z.enum(['up', 'down']),
  latencyMs: z.number(),
  error: z.string().optional(),
});

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('data-assistant'),
  uptimeSeconds: z.number(),
  timestamp: z.iso.datetime(),
});

const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  timestamp: z.iso.datetime(),
  dependencies: z.array(dependencyResultSchema),
});

export function createHealthRoutes(
  checkReadiness: CheckReadinessUseCase,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/health',
      {
        schema: {
          response: { 200: healthResponseSchema },
        },
      },
      async () => ({
        status: 'ok' as const,
        service: 'data-assistant' as const,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      }),
    );

    app.get(
      '/ready',
      {
        schema: {
          response: {
            200: readinessResponseSchema,
            503: readinessResponseSchema,
          },
        },
      },
      async (_request, reply) => {
        const report = await checkReadiness.execute();
        const statusCode = report.status === 'ready' ? 200 : 503;
        return reply.status(statusCode).send(report);
      },
    );
  };
}