import { createQueue, createWorker, type Job } from './queue.factory.js';
import { createLogger } from '../utils/logger.js';
import { extractMemory } from '../ai/gemini.service.js';
import { memoryService } from '../services/memory.service.js';
import { ReminderService } from '../reminders/reminder.service.js';
import { ReminderExtractionSchema } from '@echomind/types';
import { CONSTANTS } from '../config/constants.js';
import { enqueueEmbedding } from './embedding.queue.js';
import { deepgramService } from '../services/DeepgramService.js';
import { extractMeetingInsights } from '../ai/gemini.service.js';

const log = createLogger('ai-queue');

// ─── Job Payload ──────────────────────────────────────────────
interface AIProcessingJobData {
  userId: string;
  transcript?: string;
  filePath?: string;
  sourceType: 'voice' | 'text' | 'import' | 'meeting';
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
    const { userId, transcript, filePath, sourceType, language, correlationId } = job.data;
    log.info({ userId, language, correlationId, jobId: job.id, filePath }, 'Processing transcript');

    let segments: Array<{ speakerId: string; text: string; startTime: number; endTime: number }> = [];
    let processingTranscript = transcript || '';

    // 1. Handle diarization if filePath is provided
    if (filePath && (sourceType === 'voice' || sourceType === 'meeting')) {
      segments = await deepgramService.transcribeFile(filePath);
      processingTranscript = segments.map(s => `[${s.speakerId}] ${s.text}`).join('\n');
    } else if (transcript) {
      segments = [{ speakerId: 'Speaker 0', text: transcript, startTime: 0, endTime: 0 }];
    }

    if (!processingTranscript) {
      log.warn({ correlationId }, 'No transcript or audio provided');
      return;
    }

    // 2. AI memory extraction (from combined transcript)
    const extraction = await extractMemory(processingTranscript);
    if (!extraction) {
      log.warn({ correlationId }, 'AI extraction returned null');
      return;
    }

    // 3. Save memory with relational segments
    const memory = await memoryService.saveFromExtraction(userId, extraction, segments, sourceType);

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

    // 5. Special handling for Meeting Mode
    if (sourceType === 'meeting') {
      try {
        const insights = await extractMeetingInsights(processingTranscript);
        if (insights) {
          log.info({ memoryId: memory.id }, 'Extracted meeting insights (stored in memory)');
          // Future: Add more meeting-specific logic here if needed
        }
      } catch (err) {
        log.error({ err, memoryId: memory.id }, 'Meeting post-processing failed');
      }
    }

    // Store result in job return value for WS notification
    return {
      memoryId: memory.id,
      title: extraction.title,
      summary: extraction.summary,
      category: extraction.category,
      importance: extraction.importance
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
