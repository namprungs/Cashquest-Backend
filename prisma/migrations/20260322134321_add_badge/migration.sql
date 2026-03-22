-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleJson" JSONB NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badges" (
    "studentProfileId" UUID NOT NULL,
    "badgeId" UUID NOT NULL,
    "earnedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("studentProfileId","badgeId")
);

-- CreateIndex
CREATE INDEX "badges_termId_idx" ON "badges"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "badges_termId_code_key" ON "badges"("termId", "code");

-- CreateIndex
CREATE INDEX "student_badges_badgeId_idx" ON "student_badges"("badgeId");

-- AddForeignKey
ALTER TABLE "badges" ADD CONSTRAINT "badges_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
