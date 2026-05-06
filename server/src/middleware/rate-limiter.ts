import type { Request, Response, NextFunction } from 'express';
import { CONSTANTS } from '../config/constants.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 300_000);

/**
 * In-memory rate limiter middleware.
 * For production scale, replace with Redis-backed limiter.
 */
export function rateLimiter(maxRequests?: number, windowMs?: number) {
  const max = maxRequests ?? CONSTANTS.RATE_LIMIT_MAX_REQUESTS;
  const window = windowMs ?? CONSTANTS.RATE_LIMIT_WINDOW_MS;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (req as any).userId || req.ip || 'unknown';
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + window });
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - entry.count);
    next();
  };
}
