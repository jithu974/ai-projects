export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  isRetryable: (err: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

export function isHttpTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const status =
    'status' in err && typeof err.status === 'number'
      ? err.status
      : 'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : undefined;

  // Fail fast on client/auth errors (400, 401, 403, 404); retry rate limits & server faults
  if (status !== undefined) {
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }

  const code = 'code' in err && typeof err.code === 'string' ? err.code : '';
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(
    code,
  );
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxDelay = options.maxDelayMs ?? 15_000;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= options.maxRetries || !options.isRetryable(err)) {
        throw err;
      }
      attempt += 1;
      // Exponential backoff with full jitter to prevent thundering herds
      const ceiling = Math.min(maxDelay, options.baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.max(25, Math.floor(Math.random() * ceiling));
      options.onRetry?.(attempt, delayMs, err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}