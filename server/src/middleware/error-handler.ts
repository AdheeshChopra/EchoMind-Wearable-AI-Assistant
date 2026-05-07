import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../utils/logger.js';
import { AppError } from './errors.js';
import type { ApiResponse } from '@echomind/types';

const log = createLogger('error-handler');

/**
 * Global error handler middleware.
 * Catches all errors, logs them, and returns a structured JSON response.
 * Must be registered LAST in Express middleware chain.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── Zod Validation Errors ──
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    };
    res.status(400).json(response);
    return;
  }

  // ── Known Application Errors ──
  if (err instanceof AppError) {
    if (!err.isOperational) {
      log.error({ err, code: err.code }, 'Non-operational error');
    } else {
      log.warn({ code: err.code, message: err.message }, 'Operational error');
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // ── Unknown/Unhandled Errors ──
  log.error({ err }, 'Unhandled error');

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    },
  };
  res.status(500).json(response);
}
