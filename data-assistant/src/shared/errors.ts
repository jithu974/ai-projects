export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
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

export class NotFoundError extends AppError {
  constructor(message: string) {
    super({ message, statusCode: 404, code: 'NOT_FOUND' });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super({ message, statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ message, statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', details });
  }
}

export type ParseErrorReason =
  | 'CORRUPTED_FILE'
  | 'ENCRYPTED_DOCUMENT'
  | 'SCANNED_PDF_REQUIRES_OCR'
  | 'EMPTY_CONTENT'
  | 'UNSUPPORTED_FORMAT';

export class DocumentParsingError extends Error {
  public readonly reason: ParseErrorReason;
  public readonly retryable: boolean;

  constructor(reason: ParseErrorReason, message: string, retryable = false, cause?: unknown) {
    super(message, { cause });
    this.name = 'DocumentParsingError';
    this.reason = reason;
    this.retryable = retryable;
  }
}