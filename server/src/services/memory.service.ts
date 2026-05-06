import { createLogger } from '@echomind/logger';
import prisma from '../db/prisma.js';
import { embeddingService, EmbeddingService } from '../embeddings/embedding.service.js';
import { detectLanguage } from '../nlp/language.service.js';
import type { MemoryExtraction } from '@echomind/types';

const log = createLogger('memory-service');

/**
 * Core memory service — CRUD operations and embedding generation.
 */
export class MemoryService {
  /**
   * Save an extracted memory from the AI pipeline.
   * 1. Detect language
   * 2. Create the memory record
   * 3. Generate embedding asynchronously (or via BullMQ queue)
   */
  async saveFromExtraction(
    userId: string,
    extraction: MemoryExtraction,
    rawTranscript: string,
    sourceType: 'voice' | 'text' | 'import' = 'voice',
  ) {
    let nextActionDate: Date | null = null;
    if (extraction.category === 'Task') {
      nextActionDate = new Date();
      nextActionDate.setHours(nextActionDate.getHours() + 24);
    }

    // Detect language from the raw transcript
    const langResult = detectLanguage(rawTranscript);

    // 1. Save memory without embedding
    const memory = await prisma.memory.create({
      data: {
        userId,
        title: extraction.title,
        summary: extraction.summary,
        category: extraction.category,
        importance: extraction.importance,
        rawTranscript,
        sourceType,
        language: langResult.language,
        tags: extraction.tags || [],
        nextActionDate,
      },
    });

    // 2. Generate and store embedding (non-blocking for the caller)
    // NOTE: When BullMQ is active, the WebSocket handler enqueues this instead.
    this.generateAndStoreEmbedding(memory.id, extraction.title, extraction.summary)
      .catch((err) => log.error({ err, memoryId: memory.id }, 'Background embedding failed'));

    return memory;
  }

  /**
   * Get all memories for a user with optional filtering.
   */
  async getMemories(
    userId: string,
    options?: { category?: string; limit?: number; offset?: number },
  ) {
    const where: any = { userId, deletedAt: null };
    if (options?.category && options.category !== 'All') {
      where.category = options.category;
    }

    return prisma.memory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: { reminders: true },
    });
  }

  /**
   * Get a single memory by ID (with ownership check).
   */
  async getById(userId: string, memoryId: string) {
    return prisma.memory.findFirst({
      where: { id: memoryId, userId, deletedAt: null },
      include: { reminders: true },
    });
  }

  /**
   * Soft delete a memory.
   */
  async softDelete(userId: string, memoryId: string) {
    return prisma.memory.updateMany({
      where: { id: memoryId, userId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Re-extract memory from stored transcript.
   */
  async retryExtraction(userId: string, memoryId: string, extractFn: (text: string) => Promise<MemoryExtraction | null>) {
    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, userId, deletedAt: null },
    });

    if (!memory || !memory.rawTranscript) return null;

    const extraction = await extractFn(memory.rawTranscript);
    if (!extraction) return null;

    const updated = await prisma.memory.update({
      where: { id: memory.id },
      data: {
        title: extraction.title,
        summary: extraction.summary,
        category: extraction.category,
        importance: extraction.importance,
        tags: extraction.tags || [],
      },
    });

    // Re-generate embedding with updated title/summary
    this.generateAndStoreEmbedding(memory.id, extraction.title, extraction.summary)
      .catch((err) => log.error({ err, memoryId: memory.id }, 'Retry embedding failed'));

    return updated;
  }

  // ─── Private ────────────────────────────────────────────────

  private async generateAndStoreEmbedding(memoryId: string, title: string, summary: string) {
    const textToEmbed = `Title: ${title}\nSummary: ${summary}`;
    const embedding = await embeddingService.generate(textToEmbed);
    const vec = EmbeddingService.toSqlVector(embedding);

    await prisma.$executeRaw`
      UPDATE "Memory" SET embedding = ${vec}::vector WHERE id = ${memoryId}
    `;

    log.info({ memoryId }, 'Embedding stored');
  }
}

export const memoryService = new MemoryService();
