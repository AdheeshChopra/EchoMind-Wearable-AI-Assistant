import { z } from 'zod';

// ─── Memory Categories ────────────────────────────────────────
export const MemoryCategoryEnum = z.enum(['Task', 'Fact', 'Idea']);
export type MemoryCategory = z.infer<typeof MemoryCategoryEnum>;

// ─── Memory Source ────────────────────────────────────────────
export const MemorySourceEnum = z.enum(['voice', 'text', 'import', 'meeting']);
export type MemorySource = z.infer<typeof MemorySourceEnum>;

// ─── Memory Extraction (from AI) ──────────────────────────────
export const MemoryExtractionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  summary: z.string().min(1, 'Summary is required'),
  category: MemoryCategoryEnum,
  importance: z.number().min(0).max(1),
  tags: z.array(z.string()).optional().default([]),
  reminder: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    dueAt: z.string().describe('ISO 8601 date string'),
    category: z.string(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    repeatRule: z.string().optional().nullable(),
    isCritical: z.boolean().default(false),
  }).optional(),
});

export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

export interface TranscriptSegment {
  id: string;
  memoryId: string;
  speakerId: string;
  text: string;
  startTime: number;
  endTime: number;
  createdAt: Date;
}

// ─── Memory Record (from DB) ─────────────────────────────────
export interface Memory {
  id: string;
  userId: string;
  title: string;
  summary: string;
  category: MemoryCategory;
  importance: number;
  sourceType: 'voice' | 'text' | 'import' | 'meeting';
  tags: string[];
  nextActionDate: Date | null;
  conversationId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  segments?: TranscriptSegment[];
}

// ─── Memory Search Result ─────────────────────────────────────
export interface MemorySearchResult extends Memory {
  similarity: number;
}

// ─── Create Memory Request ────────────────────────────────────
export const CreateMemorySchema = z.object({
  text: z.string().min(1, 'Transcript text is required'),
  sourceType: z.enum(['voice', 'text', 'import', 'meeting']).default('text'),
});

export type CreateMemoryRequest = z.infer<typeof CreateMemorySchema>;

// ─── Search Memory Request ────────────────────────────────────
export const SearchMemorySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  category: MemoryCategoryEnum.optional(),
  mode: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
});

export type SearchMemoryRequest = z.infer<typeof SearchMemorySchema>;
