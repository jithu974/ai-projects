import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { CheckReadinessUseCase } from '../application/check-readiness.js';
import type { IHealthCheckable } from '../domain/health.js';
import { buildLoggerOptions } from '../observability/logger.js';
import type { AppConfig } from '../shared/config.js';
import { AppError } from '../shared/errors.js';
import { createDocumentRoutes, type DocumentIngestUseCase } from './routes/document.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';

export interface ServerDependencies {
  config: AppConfig;
  healthChecks: readonly IHealthCheckable[];
  ingestUseCase?: DocumentIngestUseCase;
}

export function buildServer({ config, healthChecks, ingestUseCase }: ServerDependencies): FastifyInstance {
  const loggerOptions = buildLoggerOptions(config);
  const app = Fastify({
    ...(loggerOptions !== undefined ? { logger: loggerOptions } : {}),
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    },
  });

  // Propagate correlation ID on every response
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Centralized exception handler
  app.setErrorHandler((err, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId: request.id,
          details: err.validation,
        },
      });
    }

    if (err instanceof AppError) {
      if (!err.isOperational) {
        request.log.error({ err }, 'Non-operational AppError');
      } else {
        request.log.warn({ err, code: err.code }, err.message);
      }
      return reply.status(err.statusCode).send({
        error: {
          code: err.code,
          message: err.message,
          requestId: request.id,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      });
    }

    request.log.error({ err }, 'Unhandled exception');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.id,
      },
    });
  });

  const checkReadiness = new CheckReadinessUseCase(
    healthChecks,
    config.HEALTH_CHECK_TIMEOUT_MS,
  );
  app.register(createHealthRoutes(checkReadiness));
  if (ingestUseCase) {
    app.register(createDocumentRoutes(ingestUseCase), { prefix: '/api/v1' });
  }

  return app;
}