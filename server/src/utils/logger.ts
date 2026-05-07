// Zero-G Mock: Anti-gravity adapter for @echomind/logger
// This lightweight mock intercepts the missing package import to prevent crashes.

const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
  trace: (...args: any[]) => console.log('[TRACE]', ...args),
  fatal: (...args: any[]) => console.error('[FATAL]', ...args),
  child: () => logger
};

export const createLogger = () => logger;
export const withCorrelation = (id: string, fn: Function) => fn();
export { logger };


