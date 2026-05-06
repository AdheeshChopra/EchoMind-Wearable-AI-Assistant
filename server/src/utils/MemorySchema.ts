import { z } from 'zod';

export const MemoryCategoryEnum = z.enum(['Task', 'Fact', 'Idea']);

export const ReminderSchema = z.object({
  title: z.string().min(1, "Reminder title is required"),
  description: z.string().optional(),
  dueAt: z.string().describe("ISO 8601 date string for when the reminder is due"),
  category: z.string().describe("One of: work, health, meeting, personal, study, family, payment, errands"),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  repeatRule: z.string().nullable().optional().describe("daily, weekly, monthly, weekdays, or null"),
  isCritical: z.boolean().default(false)
});

export const MemoryExtractionSchema = z.object({
  title: z.string().min(1, "Title is required").describe("A concise, declarative title."),
  summary: z.string().min(1, "Summary is required").describe("A concise, present-tense, actionable summary in Second Brain style."),
  category: MemoryCategoryEnum.describe("Must be exactly 'Task', 'Fact', or 'Idea'."),
  importance: z.number().min(0).max(1).describe("Importance score from 0.0 to 1.0."),
  reminder: ReminderSchema.optional().describe("Set if the user explicitly mentions a time-based task, appointment, or deadline.")
});

export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;
export type ReminderExtraction = z.infer<typeof ReminderSchema>;

