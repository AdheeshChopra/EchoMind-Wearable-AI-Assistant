import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from './errors.js';

/**
 * Validates request body/query/params against a Zod schema.
 * Usage: router.post('/route', validate(MySchema, 'body'), handler)
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      throw AppError.badRequest('Validation failed', result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })));
    }

    // Replace with parsed (coerced + defaulted) values
    (req as any)[source] = result.data;
    next();
  };
}
