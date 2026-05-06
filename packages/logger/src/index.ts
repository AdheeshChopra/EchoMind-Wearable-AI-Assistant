import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Creates a structured Pino logger instance.
 * - Dev: pretty-printed with colors and timestamps
 * - Prod: raw JSON for log aggregation (ELK, Datadog, etc.)
 */
export function createLogger(name: string, options?: Partial<LoggerOptions>): Logger {
  const baseOptions: LoggerOptions = {
    name,
    level: process.env.LOG_LEVEL || 'info',
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
    ...options,
  };

  return pino(baseOptions);
}

/**
 * Create a child logger with a correlation ID for request tracing.
 */
export function withCorrelation(logger: Logger, correlationId: string): Logger {
  return logger.child({ correlationId });
}

/**
 * Default application-level logger.
 */
export const logger = createLogger('echomind');
