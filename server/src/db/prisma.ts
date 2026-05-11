import { PrismaClient } from '@prisma/client';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '../utils/logger.js';
import ws from 'ws';
import { env } from '../config/env.js';

// ─── Enable WebSocket connection for port 443 ─────────────────
neonConfig.webSocketConstructor = ws;

const log = createLogger('prisma');

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let prisma: PrismaClient;

try {
  const connectionString = env.DATABASE_URL;
  log.info({ 
    hasConnectionString: !!connectionString,
    connectionStringPrefix: connectionString?.substring(0, 20) + '...'
  }, 'Instantiating Prisma with Neon adapter');

  // Use the Neon Serverless Pool (connects via HTTPS/WebSocket on port 443)
  // We limit the pool size to avoid exhausting Neon connections on smaller plans
  const pool = new Pool({ 
    connectionString,
    max: 10, // Max concurrent connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  
  const adapter = new PrismaPg(pool as any);

  prisma = new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'info', 'warn', 'error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }
} catch (error) {
  log.error({ error }, 'Failed to instantiate Prisma Client');
  throw error;
}

export default prisma;
