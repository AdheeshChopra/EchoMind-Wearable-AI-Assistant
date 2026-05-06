import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createLogger, withCorrelation } from '@echomind/logger';
import { performance } from 'perf_hooks';

const log = createLogger('http');

/**
 * Request logging middleware.
 * Attaches a correlation ID to every request and logs request/response lifecycle.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  const startTime = performance.now();

  // Attach to request for downstream use
  (req as any).correlationId = correlationId;
  (req as any).log = withCorrelation(log, correlationId);

  // Set response header
  res.setHeader('X-Correlation-Id', correlationId);

  // Log on response finish
  res.on('finish', () => {
    const latencyMs = (performance.now() - startTime).toFixed(0);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log[level]({
      correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs: Number(latencyMs),
      userAgent: req.headers['user-agent'],
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${latencyMs}ms`);
  });

  next();
}
