import cron from 'node-cron';
import { ReminderService } from './ReminderService.js';
import { NotificationService } from './NotificationService.js';
import { logger } from '../utils/logger.js';

export class SchedulerService {
  static init() {
    logger.info('[SCHEDULER] Initializing Reminder Engine...');

    // Run every minute
    cron.schedule('* * * * *', async () => {
      try {
        const upcoming = await ReminderService.getUpcomingReminders(1); // Check for reminders due in the next 1 minute
        
        if (upcoming.length > 0) {
          logger.info(`[SCHEDULER] Found ${upcoming.length} upcoming reminders`);
          
          for (const reminder of upcoming) {
            await NotificationService.notifyReminder(reminder);
            
            // For now, we'll just log it and maybe mark it as "notified" if we had that field.
            // In a real app, you'd track advanceOffsets to send multiple alerts.
          }
        }
      } catch (error) {
        logger.error({ error }, '[SCHEDULER] Error in reminder check loop');
      }
    });

    logger.info('[SCHEDULER] Reminder Engine Running (1min interval)');
  }
}
