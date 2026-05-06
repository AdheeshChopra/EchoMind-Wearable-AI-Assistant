import { createQueue, createWorker, type Job } from './queue.factory.js';
import { createLogger } from '@echomind/logger';
import { CONSTANTS } from '../config/constants.js';
import Expo from 'expo-server-sdk';

const log = createLogger('notification-queue');

const expo = new Expo();

// ─── Job Payload ──────────────────────────────────────────────
interface NotificationJobData {
  userId: string;
  pushToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// ─── Queue ────────────────────────────────────────────────────
export const notificationQueue = createQueue<NotificationJobData>(CONSTANTS.QUEUE_NAMES.NOTIFICATION);

// ─── Worker ───────────────────────────────────────────────────
export const notificationWorker = createWorker<NotificationJobData>(
  CONSTANTS.QUEUE_NAMES.NOTIFICATION,
  async (job: Job<NotificationJobData>) => {
    const { pushToken, title, body, data } = job.data;

    if (!Expo.isExpoPushToken(pushToken)) {
      log.warn({ pushToken }, 'Invalid Expo push token — skipping');
      return;
    }

    const chunks = expo.chunkPushNotifications([{
      to: pushToken,
      title,
      body,
      data: data as any,
      sound: 'default',
      priority: 'high',
    }]);

    for (const chunk of chunks) {
      try {
        const results = await expo.sendPushNotificationsAsync(chunk);
        log.info({ results, jobId: job.id }, 'Push notification sent');
      } catch (err) {
        log.error({ err, jobId: job.id }, 'Push notification failed');
        throw err; // Triggers BullMQ retry
      }
    }
  },
  5, // Concurrency: 5 parallel notifications
);

/**
 * Enqueue a push notification.
 */
export async function enqueueNotification(data: NotificationJobData): Promise<void> {
  await notificationQueue.add('send', data);
}
