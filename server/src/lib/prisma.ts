import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../utils/logger.js';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let prisma: PrismaClient;

try {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('[ERROR] DATABASE_URL is missing in environment variables. Prisma 7 requires a connection string via adapter or config.');
  } else {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    prisma =
      globalForPrisma.prisma ||
      new PrismaClient({
        adapter,
        log: ['query', 'info', 'warn', 'error'],
      });

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
  }
} catch (error) {
  logger.error({ error }, '[ERROR] Failed to instantiate Prisma Client');
  throw error;
}

export default prisma;
