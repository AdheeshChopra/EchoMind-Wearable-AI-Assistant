import { Router } from 'express';
import { MemoryController } from '../controllers/MemoryController.js';

import { ReminderController } from '../controllers/ReminderController.js';

const router = Router();
const memoryController = new MemoryController();
const reminderController = new ReminderController();

router.get('/memories', memoryController.getMemories);
router.get('/memories/semantic-search', memoryController.semanticSearch);
router.post('/memories/:id/retry', memoryController.retryExtraction);

// Reminders
router.get('/reminders', reminderController.getReminders);
router.patch('/reminders/:id/status', reminderController.updateReminderStatus);
router.delete('/reminders/:id', reminderController.deleteReminder);

export default router;

