import { Request, Response } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger.js';
import prisma from '../lib/prisma.js';
import { MemoryRepository } from '../repositories/MemoryRepository.js';
import { extractMemory } from '../services/gemini.service.js';

const memoryRepo = new MemoryRepository();

export class MemoryController {
  async getMemories(req: Request, res: Response): Promise<void> {
    try {
      const { q, category } = req.query;
      let whereClause: any = {};

      if (category && category !== 'All') {
        whereClause.category = String(category);
      }

      if (q && typeof q === 'string' && q.trim().length > 0) {
        whereClause.OR = [
          { summary: { contains: q.trim(), mode: 'insensitive' } },
          { title: { contains: q.trim(), mode: 'insensitive' } },
          { segments: { some: { text: { contains: q.trim(), mode: 'insensitive' } } } }
        ];
      }

      const startTime = performance.now();
      const memories = await prisma.memory.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: { segments: true },
      });
      const endTime = performance.now();
      logger.info(`[API] GET /api/memories — Latency: ${(endTime - startTime).toFixed(0)}ms | Found: ${memories.length}`);

      res.json({ memories });
    } catch (err) {
      logger.error({ err }, '[API] Search Error');
      res.status(500).json({ error: 'Failed to fetch memories', memories: [] });
    }
  }

  async semanticSearch(req: Request, res: Response): Promise<void | Response> {
    try {
      const { q, limit } = req.query;

      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        return res.status(400).json({ error: 'Query parameter "q" is required for semantic search' });
      }

      const searchLimit = limit ? parseInt(String(limit), 10) : 5;

      const startTime = performance.now();
      const memories = await memoryRepo.searchSimilarMemories(q.trim(), searchLimit) as any[];
      const endTime = performance.now();

      logger.info(`[API] GET /api/memories/semantic-search — Latency: ${(endTime - startTime).toFixed(0)}ms | Found: ${memories.length}`);

      res.json({ memories });
    } catch (err) {
      logger.error({ err }, '[API] Semantic Search Error');
      res.status(500).json({ error: 'Failed to perform semantic search' });
    }
  }

  async retryExtraction(req: Request, res: Response): Promise<void | Response> {
    try {
      const memory = await prisma.memory.findUnique({ 
        where: { id: String(req.params.id) },
        include: { segments: { orderBy: { startTime: 'asc' } } }
      });
      
      if (!memory || memory.segments.length === 0) {
        return res.status(404).json({ error: 'Memory or transcript segments not found' });
      }

      const fullTranscript = memory.segments.map(s => s.text).join(' ');
      const extractionStart = performance.now();
      const newExtraction = await extractMemory(fullTranscript);
      if (!newExtraction) return res.status(500).json({ error: 'Extraction failed' });

      const updated = await prisma.memory.update({
        where: { id: memory.id },
        data: {
          title: newExtraction.title,
          summary: newExtraction.summary,
          category: newExtraction.category,
          importance: newExtraction.importance
        }
      });
      const extractionLatency = performance.now() - extractionStart;
      logger.info(`[AUDIT] Retry Extraction -> (${extractionLatency.toFixed(0)}ms) -> DB Write (Success)`);
      res.json({ memory: updated });
    } catch (err) {
      logger.error({ err }, '[API] Retry Error');
      res.status(500).json({ error: 'Server error' });
    }
  }
}
