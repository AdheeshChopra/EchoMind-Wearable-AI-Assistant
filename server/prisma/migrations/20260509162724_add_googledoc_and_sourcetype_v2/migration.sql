-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "googleDocUrl" TEXT,
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'audio';
