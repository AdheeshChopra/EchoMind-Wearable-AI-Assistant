import prisma from '../lib/prisma.js';
import { ReminderExtraction } from '../utils/MemorySchema.js';
import { logger } from '../utils/logger.js';

// Using shared prisma instance from ../lib/prisma to comply with Prisma 7 adapter requirements

export class ReminderService {
  /**
   * Creates a reminder and links it to a memory.
   */
  static async createReminder(userId: string, memoryId: string, extraction: ReminderExtraction) {
    try {
      logger.info({ memoryId, extraction }, '[REMINDER] Creating reminder from memory');

      const reminder = await prisma.reminder.create({
        data: {
          userId,
          memoryId,
          title: extraction.title,
          description: extraction.description || null,
          dueAt: new Date(extraction.dueAt),
          category: extraction.category,
          priority: extraction.priority,
          repeatRule: extraction.repeatRule || null,
          isCritical: extraction.isCritical || false,
          status: 'pending',
          advanceOffsets: [30, 15, 5] // Default offsets
        }
      });

      logger.info({ reminderId: reminder.id }, '[REMINDER] Reminder created successfully');
      return reminder;
    } catch (error) {
      logger.error({ error, memoryId }, '[REMINDER] Failed to create reminder');
      throw error;
    }
  }

  /**
   * Get upcoming reminders that need notification processing
   */
  static async getUpcomingReminders(windowMinutes: number = 30) {
    const now = new Date();
    const future = new Date(now.getTime() + windowMinutes * 60000);

    return prisma.reminder.findMany({
      where: {
        status: 'pending',
        dueAt: {
          gte: now,
          lte: future
        }
      }
    });
  }

  /**
   * Mark reminder as completed
   */
  static async completeReminder(id: string) {
    return prisma.reminder.update({
      where: { id },
      data: { 
        status: 'completed',
        completedAt: new Date()
      }
    });
  }

  /**
   * Snooze reminder
   */
  static async snoozeReminder(id: string, minutes: number = 10) {
    const snoozeTime = new Date(Date.now() + minutes * 60000);
    return prisma.reminder.update({
      where: { id },
      data: {
        status: 'snoozed',
        snoozedUntil: snoozeTime
      }
    });
  }
}
