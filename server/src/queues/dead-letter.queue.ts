import { createQueue, createWorker, type Job } from './queue.factory.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('dead-letter');

/**
 * Dead-Letter Queue (DLQ) Handler
 *
 * When jobs fail all retry attempts in any queue, they're moved here for:
 * 1. Permanent logging
 * 2. Alert generation
 * 3. Optional manual reprocessing
 *
 * This prevents failed jobs from being silently dropped while keeping
 * the primary queues clean.
 */

interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  failedReason: string;
  payload: Record<string, unknown>;
  failedAt: string;
  attempts: number;
}

// ─── Queue ────────────────────────────────────────────────────
export const deadLetterQueue = createQueue<DeadLetterJobData>('dead-letter');

// ─── Worker ───────────────────────────────────────────────────
export const deadLetterWorker = createWorker<DeadLetterJobData>(
  'dead-letter',
  async (job: Job<DeadLetterJobData>) => {
    const { originalQueue, originalJobId, failedReason, attempts } = job.data;

    // Log permanently for monitoring
    log.error({
      originalQueue,
      originalJobId,
      failedReason,
      attempts,
      dlqJobId: job.id,
    }, 'Job moved to dead-letter queue');

    // In production, this would also:
    // - Write to a persistent error log table
    // - Send alerts to monitoring (PagerDuty, Slack webhook, etc.)
    // - Increment error metrics
  },
  1, // Low concurrency — DLQ processing is not time-sensitive
);

/**
 * Move a failed job to the dead-letter queue.
 * Called from other queue workers when max retries are exhausted.
 */
export async function moveToDeadLetter(
  originalQueue: string,
  originalJobId: string,
  failedReason: string,
  payload: Record<string, unknown>,
  attempts: number,
): Promise<void> {
  await deadLetterQueue.add('dead-letter', {
    originalQueue,
    originalJobId,
    failedReason,
    payload,
    failedAt: new Date().toISOString(),
    attempts,
  });

  log.warn({ originalQueue, originalJobId }, 'Job sent to dead-letter queue');
}

/**
 * Get dead-letter queue statistics.
 */
export async function getDeadLetterStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    deadLetterQueue.getWaitingCount(),
    deadLetterQueue.getActiveCount(),
    deadLetterQueue.getCompletedCount(),
    deadLetterQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
