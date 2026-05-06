import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimiter } from './middleware/rate-limiter.js';

import authRoutes from './routes/auth.routes.js';
import memoryRoutes from './routes/memory.routes.js';
import reminderRoutes from './routes/reminder.routes.js';

/**
 * Creates and configures the Express application.
 * Separated from server start for testability.
 */
export function createApp() {
  const app = express();

  // ─── Security ───────────────────────────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    credentials: true,
  }));

  // ─── Parsing ────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Logging ────────────────────────────────────────────────
  app.use(requestLogger);

  // ─── Rate Limiting ──────────────────────────────────────────
  app.use(rateLimiter());

  // ─── Health Check ───────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ─── API Routes ─────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/memories', memoryRoutes);
  app.use('/api/reminders', reminderRoutes);

  // ─── 404 Handler ────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ─── Error Handler (MUST be last) ──────────────────────────
  app.use(errorHandler);

  return app;
}
