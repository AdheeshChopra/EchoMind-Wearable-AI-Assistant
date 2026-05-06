import { createQueue, createWorker, type Job } from './queue.factory.js';
import { createLogger } from '@echomind/logger';
import { extractMemory } from '../ai/gemini.service.js';
import { memoryService } from '../services/memory.service.js';
import { ReminderService } from '../reminders/reminder.service.js';
import { ReminderExtractionSchema } from '@echomind/types';
import { CONSTANTS } from '../config/constants.js';
import { enqueueEmbedding } from './embedding.queue.js';

const log = createLogger('ai-queue');

// ─── Job Payload ──────────────────────────────────────────────
interface AIProcessingJobData {
  userId: string;
  transcript: string;
  sourceType: 'voice' | 'text' | 'import';
  language?: string;
  correlationId?: string;
}

// ─── Result ───────────────────────────────────────────────────
export interface AIProcessingResult {
  memoryId: string;
  title: string;
  summary: string;
  category: string;
  importance: number;
  reminderId?: string;
  reminderTitle?: string;
  reminderDueAt?: string;
}

// ─── Queue ────────────────────────────────────────────────────
export const aiProcessingQueue = createQueue<AIProcessingJobData>(CONSTANTS.QUEUE_NAMES.AI_PROCESSING);

// ─── Worker ───────────────────────────────────────────────────
export const aiProcessingWorker = createWorker<AIProcessingJobData>(
  CONSTANTS.QUEUE_NAMES.AI_PROCESSING,
  async (job: Job<AIProcessingJobData>) => {
    const { userId, transcript, sourceType, language, correlationId } = job.data;
    log.info({ userId, language, correlationId, jobId: job.id }, 'Processing transcript');

    // 1. AI memory extraction
    const extraction = await extractMemory(transcript);
    if (!extraction) {
      log.warn({ correlationId }, 'AI extraction returned null');
      return;
    }

    // 2. Save memory (without inline embedding — queue handles it)
    const memory = await memoryService.saveFromExtraction(userId, extraction, transcript, sourceType);

    // 3. Enqueue embedding generation
    await enqueueEmbedding({
      memoryId: memory.id,
      title: extraction.title,
      summary: extraction.summary,
    });

    // 4. Save reminder if extracted
    if (extraction.reminder) {
      const parsed = ReminderExtractionSchema.safeParse(extraction.reminder);
      if (parsed.success) {
        await ReminderService.createReminder(userId, memory.id, parsed.data);
      }
    }

    // Store result in job return value for WS notification
    return {
      memoryId: memory.id,
      title: extraction.title,
      summary: extraction.summary,
      category: extraction.category,
      importance: extraction.importance,
    };
  },
  3, // Concurrency: 3 parallel AI jobs
);

/**
 * Enqueue a transcript for AI processing.
 */
export async function enqueueAIProcessing(data: AIProcessingJobData): Promise<string> {
  const job = await aiProcessingQueue.add('process', data, {
    priority: data.sourceType === 'voice' ? 1 : 2, // Voice gets priority
  });
  return job.id!;
}
