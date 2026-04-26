-- CreateEnum
CREATE TYPE "QuestDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "difficulty" "QuestDifficulty" NOT NULL DEFAULT 'EASY';
