import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { logger } from '../utils/logger.js';

const expo = new Expo();

export class NotificationService {
  /**
   * Sends a push notification to a specific user (or token for now)
   */
  static async sendPushNotification(pushToken: string, title: string, body: string, data: any = {}) {
    if (!Expo.isExpoPushToken(pushToken)) {
      logger.error(`[NOTIFY] Push token ${pushToken} is not a valid Expo push token`);
      return;
    }

    const messages: ExpoPushMessage[] = [{
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      channelId: 'reminders'
    }];

    try {
      const chunks = expo.chunkPushNotifications(messages);
      const tickets = [];
      
      for (const chunk of chunks) {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }
      
      logger.info({ tickets }, '[NOTIFY] Notifications sent successfully');
      return tickets;
    } catch (error) {
      logger.error({ error }, '[NOTIFY] Error sending notification');
    }
  }

  /**
   * Broadcast-like notification (placeholder for when we have user tokens)
   */
  static async notifyReminder(reminder: any) {
    // For MVP, we'll log it. In production, we'd fetch the user's push token.
    logger.info(`[NOTIFY] ALERT: ${reminder.title} is due at ${reminder.dueAt}`);
    
    // If we had a token saved in DB:
    // await this.sendPushNotification(user.pushToken, `Reminder: ${reminder.title}`, reminder.description || 'Time to get it done!');
  }
}
