import { Router, type Request, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { AuthService } from '../auth/auth.service.js';
import { requireAuth } from '../auth/middleware.js';
import { DeviceRegistrationSchema, RefreshTokenSchema, UpdatePushTokenSchema } from '@echomind/types';
import { rateLimiter } from '../middleware/rate-limiter.js';
import { CONSTANTS } from '../config/constants.js';

const router = Router();

// Stricter rate limiting on auth endpoints
const authLimiter = rateLimiter(CONSTANTS.RATE_LIMIT_AUTH_MAX, 60_000);

// ─── POST /api/auth/register ─────────────────────────────────
// Device-based registration. Issues JWT tokens on first contact.
router.post('/register', authLimiter, validate(DeviceRegistrationSchema), async (req: Request, res: Response) => {
  const { deviceId, platform, deviceName, pushToken } = req.body;
  const tokens = await AuthService.registerDevice(deviceId, platform, deviceName, pushToken);
  res.status(201).json({ success: true, data: tokens });
});

// ─── POST /api/auth/refresh ──────────────────────────────────
router.post('/refresh', authLimiter, validate(RefreshTokenSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const tokens = await AuthService.refreshTokens(refreshToken);
  res.json({ success: true, data: tokens });
});

// ─── POST /api/auth/logout ───────────────────────────────────
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  await AuthService.revokeSession(req.user!.sessionId);
  res.json({ success: true });
});

// ─── PATCH /api/auth/push-token ──────────────────────────────
router.patch('/push-token', requireAuth, validate(UpdatePushTokenSchema), async (req: Request, res: Response) => {
  // TODO: update push token in user record
  res.json({ success: true });
});

export default router;
