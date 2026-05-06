import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { AppError } from '../middleware/errors.js';
import type { AuthUser } from '@echomind/types';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Authentication middleware.
 * Validates the Bearer token and attaches user context to the request.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  const user = AuthService.verifyAccessToken(token);

  req.user = user;
  next();
}

/**
 * Optional auth — attaches user if token present, continues if not.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      req.user = AuthService.verifyAccessToken(token);
    } catch {
      // Token invalid — continue without user context
    }
  }

  next();
}
