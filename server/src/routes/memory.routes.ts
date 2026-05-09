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
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { enqueueAIProcessing } from '../queues/ai-processing.queue.js';

const router = Router();

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.wav', '.m4a', '.mp3', '.webm', '.aac', '.ogg'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported: .wav, .m4a, .mp3, .webm, .aac, .ogg'));
    }
  }
});

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

// ─── POST /api/memories/upload ──────────────────────────────
router.post('/upload', requireAuth, upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No audio file provided' } });
    return;
  }

  const userId = req.user!.userId;
  const filePath = req.file.path;

  try {
    const jobId = await enqueueAIProcessing({
      userId,
      filePath,
      sourceType: (req.body.sourceType as any) || 'voice',
      language: req.body.language || 'en'
    });

    res.status(202).json({ 
      success: true, 
      data: { 
        jobId,
        message: 'Audio upload successful, processing started'
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'QUEUE_ERROR', message: 'Failed to enqueue AI processing' } });
  }
});

// ─── DELETE /api/memories/:id ─────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await memoryService.softDelete(userId, req.params.id as string);
  res.json({ success: true });
});

export default router;
