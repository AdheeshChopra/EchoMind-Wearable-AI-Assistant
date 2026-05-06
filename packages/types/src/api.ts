// ─── Standard API Response Envelope ───────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    latencyMs?: number;
  };
}

// ─── Pagination ───────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// ─── Error Codes ──────────────────────────────────────────────
export const ErrorCodes = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  AI_PROCESSING_FAILED: 'AI_PROCESSING_FAILED',
  EMBEDDING_FAILED: 'EMBEDDING_FAILED',
  TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
