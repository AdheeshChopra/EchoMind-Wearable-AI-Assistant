import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

// ─── Environment Schema ───────────────────────────────────────
// Validated at startup. Missing or invalid vars → crash immediately.
// ────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8080'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis (for BullMQ)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // AI
  GOOGLE_API_KEY: z.string().min(1, 'Google API Key is required'),

  // STT
  WHISPER_URL: z.string().default('http://localhost:8000'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Logging
  LOG_LEVEL: z.string().default('info'),

  // Feature flags
  DEMO_MODE: z.string().default('false').transform((s) => s === 'true'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:');
  console.error(_env.error.format());
  process.exit(1);
}

export const env = _env.data;
export type Env = z.infer<typeof envSchema>;
