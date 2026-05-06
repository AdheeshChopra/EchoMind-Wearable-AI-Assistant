import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createLogger } from '@echomind/logger';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import prisma from '../db/prisma.js';
import { AppError } from '../middleware/errors.js';
import type { AuthTokens, AuthUser } from '@echomind/types';

const log = createLogger('auth');

export class AuthService {
  /**
   * Register a device and issue tokens.
   * If the device already exists, refreshes the session.
   */
  static async registerDevice(
    deviceId: string,
    platform: string,
    deviceName?: string,
    pushToken?: string,
  ): Promise<AuthTokens> {
    let user = await prisma.user.findUnique({ where: { deviceId } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          deviceId,
          platform,
          deviceName: deviceName || null,
          pushToken: pushToken || null,
        },
      });
      log.info({ userId: user.id, deviceId }, 'New device registered');
    } else if (pushToken) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pushToken },
      });
    }

    return this.createSession(user.id, deviceId);
  }

  /**
   * Create a new session and issue JWT tokens.
   */
  static async createSession(userId: string, deviceId: string): Promise<AuthTokens> {
    // Enforce max sessions per user
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (sessions.length >= CONSTANTS.MAX_SESSIONS_PER_USER) {
      // Delete oldest session
      await prisma.session.delete({ where: { id: sessions[0].id } });
    }

    const sessionId = randomUUID();
    const refreshToken = randomUUID();

    // Session expires when refresh token expires
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshToken,
        deviceId,
        expiresAt,
      },
    });

    const accessToken = this.signAccessToken({ userId, deviceId, sessionId });

    log.info({ userId, sessionId }, 'Session created');

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Refresh an access token using a valid refresh token.
   */
  static async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const session = await prisma.session.findUnique({
      where: { refreshToken },
    });

    if (!session) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      throw AppError.unauthorized('Session expired');
    }

    // Rotate refresh token for security
    const newRefreshToken = randomUUID();
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken, expiresAt: newExpiresAt },
    });

    const accessToken = this.signAccessToken({
      userId: session.userId,
      deviceId: session.deviceId,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  }

  /**
   * Verify an access token and return the user context.
   */
  static verifyAccessToken(token: string): AuthUser {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      return payload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw AppError.unauthorized('Token expired');
      }
      throw AppError.unauthorized('Invalid token');
    }
  }

  /**
   * Invalidate a session (logout).
   */
  static async revokeSession(sessionId: string): Promise<void> {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {
      // Session may already be deleted — no-op
    });
  }

  // ─── Private Helpers ──────────────────────────────────────

  private static signAccessToken(payload: AuthUser): string {
    return jwt.sign({ ...payload }, env.JWT_SECRET, { 
      expiresIn: env.JWT_EXPIRY as any 
    });
  }
}
