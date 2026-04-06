-- AlterEnum
ALTER TYPE "QuestType" ADD VALUE 'INTERACTIVE';

-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;
