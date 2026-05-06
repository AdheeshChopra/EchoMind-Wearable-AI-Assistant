import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { createLogger } from '@echomind/logger';
import { env } from '../config/env.js';

const log = createLogger('queue');

/**
 * Redis connection config for BullMQ.
 * Shared across all queues and workers.
 */
export function getRedisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Create a typed BullMQ queue with standard settings.
 */
export function createQueue<T>(name: string): Queue<T> {
  const queue = new Queue<T>(name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  queue.on('error', (err) => {
    log.error({ err, queue: name }, 'Queue error');
  });

  log.info({ queue: name }, 'Queue created');
  return queue;
}

/**
 * Create a typed BullMQ worker with standard error handling.
 */
export function createWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<any>,
  concurrency: number = 3,
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: getRedisConnection(),
    concurrency,
  });

  worker.on('completed', (job) => {
    log.info({ queue: name, jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ queue: name, jobId: job?.id, err }, 'Job failed');
  });

  worker.on('error', (err) => {
    log.error({ err, queue: name }, 'Worker error');
  });

  log.info({ queue: name, concurrency }, 'Worker started');
  return worker;
}

export type { Job };
