import { createQueue, createWorker, type Job } from './queue.factory.js';
import { createLogger } from '@echomind/logger';
import { embeddingService, EmbeddingService } from '../embeddings/embedding.service.js';
import prisma from '../db/prisma.js';
import { CONSTANTS } from '../config/constants.js';

const log = createLogger('embedding-queue');

// ─── Job Payload ──────────────────────────────────────────────
interface EmbeddingJobData {
  memoryId: string;
  title: string;
  summary: string;
}

// ─── Queue ────────────────────────────────────────────────────
export const embeddingQueue = createQueue<EmbeddingJobData>(CONSTANTS.QUEUE_NAMES.EMBEDDING);

// ─── Worker ───────────────────────────────────────────────────
export const embeddingWorker = createWorker<EmbeddingJobData>(
  CONSTANTS.QUEUE_NAMES.EMBEDDING,
  async (job: Job<EmbeddingJobData>) => {
    const { memoryId, title, summary } = job.data;
    log.info({ memoryId, jobId: job.id }, 'Generating embedding');

    const textToEmbed = `Title: ${title}\nSummary: ${summary}`;
    const embedding = await embeddingService.generate(textToEmbed);
    const vec = EmbeddingService.toSqlVector(embedding);

    await prisma.$executeRaw`
      UPDATE "Memory" SET embedding = ${vec}::vector WHERE id = ${memoryId}
    `;

    log.info({ memoryId }, 'Embedding stored via queue');
  },
  2, // Concurrency: 2 parallel embedding jobs
);

/**
 * Enqueue an embedding generation job.
 * Called by the memory service after saving a memory.
 */
export async function enqueueEmbedding(data: EmbeddingJobData): Promise<void> {
  await embeddingQueue.add('generate', data, {
    priority: 1,
    delay: 500, // Small delay to let DB write settle
  });
}
