import { z } from 'zod';

// ─── Device Registration ──────────────────────────────────────
export const DeviceRegistrationSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  deviceName: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).default('android'),
  pushToken: z.string().optional(),
});

export type DeviceRegistrationRequest = z.infer<typeof DeviceRegistrationSchema>;

// ─── Login Response ───────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ─── Refresh Token Request ────────────────────────────────────
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;

// ─── Authenticated User Context ───────────────────────────────
export interface AuthUser {
  userId: string;
  deviceId: string;
  sessionId: string;
}

// ─── Push Token Update ────────────────────────────────────────
export const UpdatePushTokenSchema = z.object({
  pushToken: z.string().min(1, 'Push token is required'),
});
