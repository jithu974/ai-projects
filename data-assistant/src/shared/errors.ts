export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_SERVER_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(params: {
    message: string;
    statusCode: number;
    code: ErrorCode;
    isOperational?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = new.target.name;
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.isOperational = params.isOperational ?? true;
    this.details = params.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ message, statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ message, statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE', cause });
  }
}