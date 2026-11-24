import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from '../shared/config.js';

export function buildLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.NODE_ENV === 'test') {
    return false;
  }

  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.apiKey',
        '*.password',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    ...(config.LOG_PRETTY && config.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l' },
          },
        }
      : {}),
  };
}