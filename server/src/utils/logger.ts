// Zero-G Mock: Anti-gravity adapter for @echomind/logger
// This lightweight mock intercepts the missing package import to prevent crashes.

const createMockLogger = (name?: string) => {
  const prefix = name ? `[${name}]` : '';
  const logger = {
    info: (arg1: any, arg2?: string) => console.log('[INFO]', prefix, arg2 || arg1, arg2 ? arg1 : ''),
    error: (arg1: any, arg2?: string) => console.error('[ERROR]', prefix, arg2 || arg1, arg2 ? arg1 : ''),
    warn: (arg1: any, arg2?: string) => console.warn('[WARN]', prefix, arg2 || arg1, arg2 ? arg1 : ''),
    debug: (arg1: any, arg2?: string) => console.log('[DEBUG]', prefix, arg2 || arg1, arg2 ? arg1 : ''),
    trace: (arg1: any, arg2?: string) => console.log('[TRACE]', prefix, arg2 || arg1, arg2 ? arg1 : ''),
    fatal: (arg1: any, arg2?: string) => console.error('[FATAL]', prefix, arg2 || arg1, arg2 ? arg1 : ''),
    child: () => logger
  };
  return logger;
};

export const createLogger = (name?: string) => createMockLogger(name);
export const withCorrelation = (logger: any, correlationId: string) => logger;
export const logger = createMockLogger();


