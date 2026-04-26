-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "order_no" INTEGER,
ADD COLUMN     "parentId" UUID;

-- CreateIndex
CREATE INDEX "quests_parentId_order_no_idx" ON "quests"("parentId", "order_no");

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
