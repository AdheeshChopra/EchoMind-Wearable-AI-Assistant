import { createLogger } from '../utils/logger.js';
import prisma from '../db/prisma.js';
import type { ReminderExtraction } from '@echomind/types';

const log = createLogger('reminder');

/**
 * Reminder service — CRUD, scheduling, and status management.
 */
export class ReminderService {
  /**
   * Create a reminder linked to a memory.
   */
  static async createReminder(
    userId: string,
    memoryId: string,
    extraction: ReminderExtraction,
  ) {
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
        advanceOffsets: [30, 15, 5],
      },
    });

    log.info({ reminderId: reminder.id, memoryId }, 'Reminder created');
    return reminder;
  }

  /**
   * Get upcoming reminders within a time window for a user.
   */
  static async getUpcoming(userId: string, windowMinutes: number = 30) {
    const now = new Date();
    const future = new Date(now.getTime() + windowMinutes * 60_000);

    return prisma.reminder.findMany({
      where: {
        userId,
        status: 'pending',
        dueAt: { gte: now, lte: future },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  /**
   * Get all reminders for a user.
   */
  static async getAll(userId: string) {
    return prisma.reminder.findMany({
      where: { userId },
      orderBy: { dueAt: 'asc' },
      include: { memory: true },
    });
  }

  /**
   * Mark reminder as completed.
   */
  static async complete(userId: string, id: string) {
    return prisma.reminder.updateMany({
      where: { id, userId },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  /**
   * Snooze reminder by N minutes.
   */
  static async snooze(userId: string, id: string, minutes: number = 10) {
    const snoozedUntil = new Date(Date.now() + minutes * 60_000);
    return prisma.reminder.updateMany({
      where: { id, userId },
      data: { status: 'snoozed', snoozedUntil },
    });
  }

  /**
   * Update reminder status.
   */
  static async updateStatus(userId: string, id: string, status: string) {
    return prisma.reminder.updateMany({
      where: { id, userId },
      data: {
        status,
        completedAt: status === 'completed' ? new Date() : null,
      },
    });
  }

  /**
   * Delete a reminder (hard delete).
   */
  static async delete(userId: string, id: string) {
    return prisma.reminder.deleteMany({ where: { id, userId } });
  }
}
