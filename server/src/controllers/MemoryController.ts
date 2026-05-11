import { Request, Response } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger.js';
import { memoryService } from '../services/memory.service.js';
import { retrievalService } from '../retrieval/retrieval.service.js';
import { enqueueAIProcessing } from '../queues/ai-processing.queue.js';
import type { ApiResponse } from '@echomind/types';

export class MemoryController {
  /**
   * GET /api/memories
   * List memories with basic filtering
   */
  async getMemories(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit) : 50;
      const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset) : 0;

      const startTime = performance.now();
      const memories = await memoryService.getMemories(userId, { category, limit, offset });
      const endTime = performance.now();

      logger.info(`[API] GET /api/memories — Latency: ${(endTime - startTime).toFixed(0)}ms | Found: ${memories.length}`);

      const response: ApiResponse = {
        success: true,
        data: { memories },
        meta: { limit, total: memories.length },
      };
      res.json(response);
    } catch (err) {
      logger.error({ err }, '[API] List Memories Error');
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch memories' } });
    }
  }

  /**
   * GET /api/memories/search
   * Hybrid/Semantic/Keyword search
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const q = req.query.q as string;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const mode = (req.query.mode as string) || 'hybrid';
      const category = req.query.category as string | undefined;

      const startTime = performance.now();
      let results;
      switch (mode) {
        case 'semantic':
          results = await retrievalService.semanticSearch(userId, q, limit);
          break;
        case 'keyword':
          results = await retrievalService.keywordSearch(userId, q, limit, category);
          break;
        default:
          results = await retrievalService.hybridSearch(userId, q, limit, category);
          break;
      }
      const endTime = performance.now();

      logger.info(`[API] SEARCH /api/memories/search — Mode: ${mode} | Latency: ${(endTime - startTime).toFixed(0)}ms | Found: ${results.length}`);

      res.json({ success: true, data: { memories: results }, meta: { total: results.length } });
    } catch (err) {
      logger.error({ err }, '[API] Search Error');
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Search failed' } });
    }
  }

  /**
   * POST /api/memories/upload
   * Handle audio file upload and enqueue processing
   */
  async uploadAudio(req: Request, res: Response): Promise<void> {
    const startTime = performance.now();
    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No audio file provided' } });
      return;
    }

    const userId = req.user!.userId;
    const filePath = req.file.path;
    const sourceType = (req.body.sourceType as any) || 'voice';

    try {
      const jobId = await enqueueAIProcessing({
        userId,
        filePath,
        sourceType,
        language: req.body.language || 'en'
      });

      const endTime = performance.now();
      logger.info({ 
        userId, 
        jobId, 
        sourceType, 
        latency: `${(endTime - startTime).toFixed(0)}ms`,
        fileName: req.file.filename 
      }, '[API] Audio upload received and queued');

      res.status(202).json({ 
        success: true, 
        data: { 
          jobId,
          message: 'Audio upload successful, processing started'
        } 
      });
    } catch (error) {
      logger.error({ error, userId, fileName: req.file.filename }, '[API] Upload Queuing Error');
      res.status(500).json({ success: false, error: { code: 'QUEUE_ERROR', message: 'Failed to enqueue AI processing' } });
    }
  }

  /**
   * POST /api/memories/:id/retry
   * Retry AI extraction for an existing memory
   */
  async retryExtraction(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const memoryId = req.params.id as string;

      const startTime = performance.now();
      const updated = await memoryService.retryExtraction(userId, memoryId, async (text) => {
        const { extractMemory } = await import('../ai/gemini.service.js');
        return extractMemory(text);
      });
      const endTime = performance.now();

      if (!updated) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Memory not found or has no transcript' } });
        return;
      }

      logger.info(`[API] RETRY /api/memories/${memoryId}/retry — Latency: ${(endTime - startTime).toFixed(0)}ms`);
      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error({ err }, '[API] Retry Error');
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Retry failed' } });
    }
  }

  /**
   * DELETE /api/memories/:id
   */
  async deleteMemory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const memoryId = req.params.id as string;

      await memoryService.softDelete(userId, memoryId);
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, '[API] Delete Error');
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Delete failed' } });
    }
  }
}

export const memoryController = new MemoryController();
