import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { validate } from '../middleware/validate.js';
import { memoryService } from '../services/memory.service.js';
import { retrievalService } from '../retrieval/retrieval.service.js';
import { extractMemory } from '../ai/gemini.service.js';
import { ReminderService } from '../reminders/reminder.service.js';
import { CreateMemorySchema, SearchMemorySchema } from '@echomind/types';
import { ReminderExtractionSchema } from '@echomind/types';
import type { ApiResponse } from '@echomind/types';

const router = Router();

// ─── GET /api/memories ────────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit) : 50;
  const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset) : 0;

  const memories = await memoryService.getMemories(userId, { category, limit, offset });

  const response: ApiResponse = {
    success: true,
    data: { memories },
    meta: { limit, total: memories.length },
  };
  res.json(response);
});

// ─── GET /api/memories/:id ────────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const memory = await memoryService.getById(userId, req.params.id as string);

  if (!memory) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Memory not found' } });
    return;
  }

  res.json({ success: true, data: memory });
});

// ─── POST /api/memories ───────────────────────────────────────
router.post('/', requireAuth, validate(CreateMemorySchema), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { text, sourceType } = req.body;

  const extraction = await extractMemory(text);
  if (!extraction) {
    res.status(422).json({
      success: false,
      error: { code: 'AI_PROCESSING_FAILED', message: 'Could not extract memory from text' },
    });
    return;
  }

  const memory = await memoryService.saveFromExtraction(userId, extraction, text, sourceType);

  // Create reminder if extracted
  let reminder = null;
  if (extraction.reminder) {
    const reminderParsed = ReminderExtractionSchema.safeParse(extraction.reminder);
    if (reminderParsed.success) {
      reminder = await ReminderService.createReminder(userId, memory.id, reminderParsed.data);
    }
  }

  const response: ApiResponse = {
    success: true,
    data: { memory, reminder },
  };
  res.status(201).json(response);
});

// ─── GET /api/memories/search ─────────────────────────────────
router.get('/search', requireAuth, validate(SearchMemorySchema, 'query'), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { q, limit, mode, category } = req.query as any;

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

  res.json({ success: true, data: { memories: results }, meta: { total: results.length } });
});

// ─── DELETE /api/memories/:id ─────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await memoryService.softDelete(userId, req.params.id as string);
  res.json({ success: true });
});

export default router;
