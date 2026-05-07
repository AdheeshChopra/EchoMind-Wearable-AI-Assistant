import { createLogger } from '../utils/logger.js';
import { detectLanguage, type SupportedLanguage } from '../nlp/language.service.js';
import { extractEntities, type NLPEntities } from '../nlp/entity-extractor.js';

const log = createLogger('memory-builder');

/**
 * Structured Memory Object — normalized representation for storage and retrieval.
 * Every memory flowing through the pipeline gets shaped into this form
 * BEFORE hitting Prisma, embeddings, or the ranking engine.
 */
export interface StructuredMemory {
  // Core content
  transcript: string;
  language: SupportedLanguage;
  isCodeSwitched: boolean;

  // AI-extracted fields (populated after Gemini extraction)
  title: string;
  summary: string;
  category: 'Task' | 'Fact' | 'Idea';
  importance: number;
  tags: string[];

  // NLP-extracted entities
  entities: {
    people: string[];
    dates: string[];
    times: string[];
    tasks: string[];
    deadlines: string[];
    locations: string[];
  };

  // Reminder (optional)
  reminder: {
    title: string;
    description?: string;
    dueAt: string; // ISO 8601
    category: string;
    priority: 'low' | 'medium' | 'high';
    repeatRule?: string | null;
    isCritical: boolean;
  } | null;

  // Contextual links (populated after memory linking)
  contextualLinks: {
    relatedMemoryIds: string[];
    followUpTo?: string;
    partOfConversation?: string;
  };

  // Metadata
  sourceType: 'voice' | 'text' | 'import';
  timestamp: number;
  processingDurationMs?: number;
}

/**
 * Build a pre-NLP structured memory from raw transcript.
 * This creates the initial shape BEFORE AI extraction runs.
 * AI-extracted fields will be merged in via `mergeAIExtraction()`.
 */
export function buildPreMemory(
  transcript: string,
  sourceType: 'voice' | 'text' | 'import' = 'voice',
): StructuredMemory {
  const startTime = Date.now();
  const langResult = detectLanguage(transcript);
  const entities = extractEntities(transcript);

  const memory: StructuredMemory = {
    transcript,
    language: langResult.language,
    isCodeSwitched: langResult.isCodeSwitched,

    // Placeholder — filled by mergeAIExtraction()
    title: '',
    summary: '',
    category: 'Fact',
    importance: 0.5,
    tags: [],

    entities: {
      people: entities.people,
      dates: entities.dates,
      times: entities.times,
      tasks: entities.tasks,
      deadlines: entities.deadlines,
      locations: entities.locations,
    },

    reminder: null,

    contextualLinks: {
      relatedMemoryIds: [],
    },

    sourceType,
    timestamp: startTime,
  };

  log.debug({
    language: memory.language,
    entityCount: entities.people.length + entities.tasks.length + entities.dates.length,
  }, 'Pre-memory built');

  return memory;
}

/**
 * Merge AI extraction results into a pre-built memory.
 * Called after Gemini returns structured extraction.
 */
export function mergeAIExtraction(
  memory: StructuredMemory,
  extraction: {
    title: string;
    summary: string;
    category: string;
    importance: number;
    tags?: string[];
    reminder?: {
      title: string;
      description?: string;
      dueAt: string;
      category: string;
      priority: string;
      repeatRule?: string | null;
      isCritical?: boolean;
    } | null;
  },
): StructuredMemory {
  const updated: StructuredMemory = {
    ...memory,
    title: extraction.title,
    summary: extraction.summary,
    category: validateCategory(extraction.category),
    importance: clampImportance(extraction.importance),
    tags: normalizeTags(extraction.tags || []),
    processingDurationMs: Date.now() - memory.timestamp,
  };

  if (extraction.reminder) {
    updated.reminder = {
      title: extraction.reminder.title,
      description: extraction.reminder.description,
      dueAt: extraction.reminder.dueAt,
      category: extraction.reminder.category || 'personal',
      priority: validatePriority(extraction.reminder.priority),
      repeatRule: extraction.reminder.repeatRule || null,
      isCritical: extraction.reminder.isCritical || false,
    };
  }

  log.info({
    title: updated.title.substring(0, 50),
    category: updated.category,
    importance: updated.importance,
    hasReminder: !!updated.reminder,
    processingMs: updated.processingDurationMs,
  }, 'AI extraction merged');

  return updated;
}

/**
 * Convert a StructuredMemory into Prisma-ready data for Memory.create().
 */
export function toPrismaData(memory: StructuredMemory, userId: string) {
  let nextActionDate: Date | null = null;
  if (memory.category === 'Task') {
    nextActionDate = new Date();
    nextActionDate.setHours(nextActionDate.getHours() + 24);
  }

  return {
    userId,
    title: memory.title,
    summary: memory.summary,
    category: memory.category,
    importance: memory.importance,
    rawTranscript: memory.transcript,
    sourceType: memory.sourceType,
    language: memory.language,
    tags: memory.tags,
    nextActionDate,
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function validateCategory(cat: string): 'Task' | 'Fact' | 'Idea' {
  if (['Task', 'Fact', 'Idea'].includes(cat)) return cat as 'Task' | 'Fact' | 'Idea';
  return 'Fact';
}

function validatePriority(priority: string): 'low' | 'medium' | 'high' {
  if (['low', 'medium', 'high'].includes(priority)) return priority as 'low' | 'medium' | 'high';
  return 'medium';
}

function clampImportance(val: number): number {
  return Math.max(0, Math.min(1, val));
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(
    tags
      .map(t => t.toLowerCase().trim())
      .filter(t => t.length > 1 && t.length < 50)
      .slice(0, 10)
  )];
}
