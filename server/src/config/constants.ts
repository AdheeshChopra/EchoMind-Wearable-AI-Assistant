// ─── Application Constants ────────────────────────────────────
export const CONSTANTS = {
  // Vector
  EMBEDDING_DIMENSION: 3072,
  EMBEDDING_MODEL: 'gemini-embedding-001',
  SIMILARITY_THRESHOLD: 0.3,

  // AI
  GEMINI_MODEL: 'gemini-2.0-flash',

  // Auth
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  MAX_SESSIONS_PER_USER: 5,

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 60_000,  // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 100,
  RATE_LIMIT_AUTH_MAX: 10,       // Auth endpoints: stricter

  // WebSocket
  WS_HEARTBEAT_INTERVAL_MS: 30_000,
  WS_MAX_MESSAGE_SIZE: 1024 * 1024 * 5, // 5MB
  WS_AUTH_TIMEOUT_MS: 5_000,

  // Streaming Pipeline
  TRANSCRIPT_STALE_PARTIAL_MS: 3_000,   // Flush partial after 3s silence
  TRANSCRIPT_MIN_LENGTH: 5,              // Min chars to process
  TRANSCRIPT_MAX_SEGMENTS: 50,           // Ring buffer size per session
  TRANSCRIPT_SIMILARITY_THRESHOLD: 0.75, // Jaccard threshold for dedup

  // Silence Detection
  SILENCE_TIMEOUT_MS: 2_000,     // End of speech after 2s silence
  SENTENCE_BOUNDARY_MS: 800,     // Pause between sentences

  // Reminders
  REMINDER_CHECK_INTERVAL_MS: 60_000,   // 1 minute
  REMINDER_WINDOW_MINUTES: 5,
  REMINDER_MAX_ESCALATION: 5,           // Max escalation level before snooze-force
  REMINDER_ADVANCE_TOLERANCE_MIN: 3,    // Tolerance for advance notification

  // Proactive Engine
  PROACTIVE_CHECK_INTERVAL_MS: 300_000, // 5 minutes
  PROACTIVE_MISSED_HOURS: 24,           // Hours before a task is "missed"
  PROACTIVE_MAX_NOTIFICATIONS: 5,       // Max notifications per cycle

  // Ranking
  RANKING_DEFAULT_LIMIT: 10,
  RANKING_RECENCY_HALFLIFE_DAYS: 7,

  // Memory Linking
  LINKING_MAX_LINKS: 5,
  LINKING_MIN_SIMILARITY: 0.5,
  LINKING_TEMPORAL_WINDOW_HOURS: 24,

  // Notification Grouping
  NOTIFICATION_GROUP_WINDOW_MS: 300_000, // Group notifications within 5 min window
  NOTIFICATION_MAX_PER_HOUR: 10,         // Rate limit per user per hour
  NOTIFICATION_QUIET_HOURS: { start: 23, end: 7 }, // 11 PM – 7 AM

  // Queues
  QUEUE_NAMES: {
    EMBEDDING: 'embedding-generation',
    NOTIFICATION: 'notification-delivery',
    AI_PROCESSING: 'ai-processing',
    DEAD_LETTER: 'dead-letter',
  },

  // Health Check
  HEALTH_DLQ_THRESHOLD: 50,  // DLQ count to trigger "degraded"
} as const;
