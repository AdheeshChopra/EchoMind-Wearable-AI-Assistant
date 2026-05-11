/*
  Warnings:

  - You are about to drop the `Transcript` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "metadata" JSONB DEFAULT '{}';

-- DropTable
DROP TABLE "Transcript";
