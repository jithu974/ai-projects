import type { FastifyBaseLogger } from 'fastify';
import type {
  ILlmProvider,
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../../domain/llm.js';
import { DependencyUnavailableError } from '../../shared/errors.js';
import { isHttpTransientError, withRetry } from '../../shared/retry.js';
import { withTimeout } from '../../shared/timeout.js';

export interface LlmServiceOptions {
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs?: number;
}

export class LlmService {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly options: LlmServiceOptions,
    private readonly logger?: FastifyBaseLogger,
  ) {}

  get providerName(): string {
    return this.provider.providerName;
  }

  get modelName(): string {
    return this.provider.modelName;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    try {
      return await withRetry(
        () =>
          withTimeout(
            this.provider.generate(request),
            this.options.timeoutMs,
            `${this.provider.providerName} LLM generation`,
          ),
        {
          maxRetries: this.options.maxRetries,
          baseDelayMs: this.options.retryBaseDelayMs ?? 750,
          isRetryable: (err) => {
            if (err instanceof Error && err.message.includes('timed out')) return true;
            return isHttpTransientError(err);
          },
          onRetry: (attempt, delayMs, err) => {
            this.logger?.warn(
              {
                provider: this.provider.providerName,
                model: this.provider.modelName,
                attempt,
                delayMs,
                err: err instanceof Error ? err.message : String(err),
              },
              'Retrying transient LLM provider error',
            );
          },
        },
      );
    } catch (err) {
      this.logger?.error(
        {
          provider: this.provider.providerName,
          model: this.provider.modelName,
          err: err instanceof Error ? err.message : String(err),
        },
        'LLM generation failed',
      );
      throw new DependencyUnavailableError(
        `LLM provider "${this.provider.providerName}" failed to generate a response`,
        err,
      );
    }
  }
}