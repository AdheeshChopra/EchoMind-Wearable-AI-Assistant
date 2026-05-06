import type { ErrorCode } from '@echomind/types';

/**
 * Application error with structured error code and HTTP status.
 * Throw these from services and controllers — the error handler middleware catches them.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // ─── Factory Methods ──────────────────────────────────────
  static badRequest(message: string, details?: unknown) {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(message, 403, 'UNAUTHORIZED');
  }

  static notFound(message = 'Not found') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message: string) {
    return new AppError(message, 409, 'CONFLICT');
  }

  static rateLimited(message = 'Too many requests') {
    return new AppError(message, 429, 'RATE_LIMITED');
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR', undefined, false);
  }

  static serviceUnavailable(message: string) {
    return new AppError(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
