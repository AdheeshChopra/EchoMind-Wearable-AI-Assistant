import { Router } from 'express';
import { DebugController } from '../controllers/DebugController.js';

const router = Router();
const debugController = new DebugController();

router.get('/debug-db', debugController.debugDb);
router.post('/debug-context', debugController.debugContext);

export default router;
