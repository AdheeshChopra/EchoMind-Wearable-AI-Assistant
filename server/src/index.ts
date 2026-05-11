// ─── MUST BE FIRST — Validate environment before anything else ──
import { env } from './config/env.js';

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createLogger } from './utils/logger.js';
import prisma from './db/prisma.js';
import { createApp } from './app.js';
import { setupWebSocket } from './websocket/handler.js';
import { startScheduler, stopScheduler } from './intelligence/scheduler.js';

// ─── Entry Point ─────────────────────────────────────────────
const log = createLogger('server');

async function start() {
  log.info({ processType: env.PROCESS_TYPE }, 'Starting EchoMind process');

  // ─── Database ───────────────────────────────────────────────
  try {
    await prisma.$connect();
    log.info('Database connected');
  } catch (err) {
    log.error({ err }, 'Failed to connect to database — aborting startup');
    process.exit(1);
  }

  const isWeb = env.PROCESS_TYPE === 'web' || env.PROCESS_TYPE === 'all';
  const isWorker = env.PROCESS_TYPE === 'worker' || env.PROCESS_TYPE === 'all';

  if (isWeb) {
    // ─── Express App ────────────────────────────────────────────
    const app = createApp();
    const server = createServer(app);

    // ─── WebSocket ──────────────────────────────────────────────
    const wss = new WebSocketServer({ server });
    const { interval } = setupWebSocket(wss);

    // ─── Start Web Server ───────────────────────────────────────
    const PORT = Number(env.PORT);
    server.listen(PORT, '0.0.0.0', () => {
      log.info({
        port: PORT,
        env: env.NODE_ENV,
        demoMode: env.DEMO_MODE,
        features: {
          web: true,
          websocket: true,
          bilingual: ['en', 'hi', 'hi-en'],
        },
      }, `EchoMind API server listening on port ${PORT}`);
    });

    // Handle graceful shutdown for web
    const shutdownWeb = async (signal: string) => {
      log.info({ signal }, 'Web shutdown signal received');
      clearInterval(interval);
      wss.close(() => log.info('WebSocket server closed'));
      await prisma.$disconnect();
      server.close(() => {
        log.info('HTTP server closed');
        process.exit(0);
      });
    };
    process.on('SIGINT', () => shutdownWeb('SIGINT'));
    process.on('SIGTERM', () => shutdownWeb('SIGTERM'));
  }

  if (isWorker) {
    log.info('Starting background workers and scheduler');
    
    // Dynamic import to avoid starting workers in web process
    await import('./queues/embedding.queue.js');
    await import('./queues/notification.queue.js');
    await import('./queues/ai-processing.queue.js');

    // ─── Background Scheduler ───────────────────────────────────
    startScheduler();

    log.info({
      queues: ['embedding', 'notification', 'ai-processing'],
    }, 'Background workers active');

    // Handle graceful shutdown for worker
    const shutdownWorker = async (signal: string) => {
      log.info({ signal }, 'Worker shutdown signal received');
      stopScheduler();
      await prisma.$disconnect();
      process.exit(0);
    };
    
    // Only register these if not already registered by web (to avoid double handling in 'all' mode)
    if (env.PROCESS_TYPE === 'worker') {
      process.on('SIGINT', () => shutdownWorker('SIGINT'));
      process.on('SIGTERM', () => shutdownWorker('SIGTERM'));
    }
  }

  // ─── Uncaught Error Handlers ────────────────────────────────
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any) => {
    log.error({ reason }, 'Unhandled rejection');
  });
}

start().catch((err) => {
  log.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
