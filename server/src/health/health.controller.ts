import { Router, type Request, type Response } from 'express';
import { createLogger } from '@echomind/logger';
import prisma from '../db/prisma.js';
import { getDeadLetterStats } from '../queues/dead-letter.queue.js';

const log = createLogger('health');

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    queues: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  details?: Record<string, unknown>;
}

const startTime = Date.now();

/**
 * GET /health — Comprehensive health check endpoint.
 * Returns:
 * - 200 if all systems healthy
 * - 503 if any critical system is down
 */
router.get('/health', async (_req: Request, res: Response) => {
  const checks = await runHealthChecks();

  const overallStatus = determineOverallStatus(checks);

  const health: HealthStatus = {
    status: overallStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  };

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
});

/**
 * GET /health/ready — Readiness probe (for Kubernetes/load balancers).
 * Returns 200 only when the server is ready to accept traffic.
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

/**
 * GET /health/live — Liveness probe.
 * Returns 200 if the process is alive (minimal check).
 */
router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ alive: true, uptime: Math.floor((Date.now() - startTime) / 1000) });
});

// ─── Private ──────────────────────────────────────────────────

async function runHealthChecks(): Promise<HealthStatus['checks']> {
  const [database, redis, queues] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkQueues(),
  ]);

  return {
    database: database.status === 'fulfilled' ? database.value : { status: 'down', details: { error: 'Check failed' } },
    redis: redis.status === 'fulfilled' ? redis.value : { status: 'down', details: { error: 'Check failed' } },
    queues: queues.status === 'fulfilled' ? queues.value : { status: 'down', details: { error: 'Check failed' } },
  };
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'up',
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    log.error({ err }, 'Database health check failed');
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      details: { error: err.message },
    };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // Try to get queue stats — if Redis is down, this will throw
    const dlqStats = await getDeadLetterStats();
    return {
      status: 'up',
      latencyMs: Date.now() - start,
      details: { deadLetterCount: dlqStats.waiting + dlqStats.failed },
    };
  } catch (err: any) {
    log.error({ err }, 'Redis health check failed');
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      details: { error: err.message },
    };
  }
}

async function checkQueues(): Promise<ComponentHealth> {
  try {
    const stats = await getDeadLetterStats();
    const hasDLQBacklog = (stats.waiting + stats.failed) > 50;

    return {
      status: hasDLQBacklog ? 'degraded' : 'up',
      details: {
        deadLetter: stats,
        warning: hasDLQBacklog ? 'High dead-letter queue backlog' : undefined,
      },
    };
  } catch {
    return { status: 'down' };
  }
}

function determineOverallStatus(
  checks: HealthStatus['checks'],
): 'healthy' | 'degraded' | 'unhealthy' {
  // Database down = unhealthy (critical)
  if (checks.database.status === 'down') return 'unhealthy';

  // Redis down = degraded (queues won't work but API still serves)
  if (checks.redis.status === 'down') return 'degraded';

  // DLQ backlog = degraded
  if (checks.queues.status === 'degraded') return 'degraded';

  return 'healthy';
}

export default router;
