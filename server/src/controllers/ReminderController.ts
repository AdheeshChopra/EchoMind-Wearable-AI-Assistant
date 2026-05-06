import { Request, Response } from 'express';
import prisma from '../db/prisma.js';
import { logger } from '../utils/logger.js';

// Using shared prisma instance from ../lib/prisma to avoid multiple connections and comply with Prisma 7 adapter requirements

export class ReminderController {
  async getReminders(req: Request, res: Response) {
    try {
      const reminders = await prisma.reminder.findMany({
        orderBy: { dueAt: 'asc' },
        include: { memory: true }
      });
      res.json(reminders);
    } catch (error) {
      logger.error({ error }, '[API] Failed to fetch reminders');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateReminderStatus(req: Request, res: Response) {
    const id = req.params.id as string;
    const { status } = req.body;

    try {
      const reminder = await prisma.reminder.update({
        where: { id },
        data: { 
          status,
          completedAt: status === 'completed' ? new Date() : null
        }
      });
      res.json(reminder);
    } catch (error) {
      logger.error({ error, id }, '[API] Failed to update reminder status');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteReminder(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await prisma.reminder.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      logger.error({ error, id }, '[API] Failed to delete reminder');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
