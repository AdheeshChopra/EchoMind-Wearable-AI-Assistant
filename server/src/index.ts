// ─── MUST BE FIRST — Validate environment before anything else ──
import { env } from './config/env.js';

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createLogger } from '@echomind/logger';
import prisma from './db/prisma.js';
import { createApp } from './app.js';
import { setupWebSocket } from './websocket/handler.js';
import { startScheduler, stopScheduler } from './intelligence/scheduler.js';

// Queue workers — import triggers worker registration
import './queues/embedding.queue.js';
import './queues/notification.queue.js';
import './queues/ai-processing.queue.js';

const log = createLogger('server');

async function start() {
  // ─── Database ───────────────────────────────────────────────
  try {
    await prisma.$connect();
    log.info('Database connected');
  } catch (err) {
    log.error({ err }, 'Failed to connect to database — aborting startup');
    process.exit(1);
  }

  // ─── Express App ────────────────────────────────────────────
  const app = createApp();
  const server = createServer(app);

  // ─── WebSocket ──────────────────────────────────────────────
  const wss = new WebSocketServer({ server });
  const { interval } = setupWebSocket(wss);

  // ─── Background Scheduler (Proactive Engine) ────────────────
  startScheduler();

  // ─── Graceful Shutdown ──────────────────────────────────────
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutdown signal received');

    // Stop scheduler
    stopScheduler();

    // Close WebSocket
    clearInterval(interval);
    wss.close(() => log.info('WebSocket server closed'));

    // Disconnect database
    await prisma.$disconnect();
    log.info('Database disconnected');

    // Close HTTP server
    server.close(() => {
      log.info('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      log.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // ─── Uncaught Error Handlers ────────────────────────────────
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any) => {
    log.error({ reason }, 'Unhandled rejection');
  });

  // ─── Start ──────────────────────────────────────────────────
  const PORT = Number(env.PORT);
  server.listen(PORT, '0.0.0.0', () => {
    log.info({
      port: PORT,
      env: env.NODE_ENV,
      demoMode: env.DEMO_MODE,
      features: {
        scheduler: true,
        queues: ['embedding', 'notification', 'ai-processing'],
        bilingual: ['en', 'hi', 'hi-en'],
      },
    }, `EchoMind server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  log.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
