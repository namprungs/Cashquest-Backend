-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUEFALSE', 'SHORT_TEXT', 'LONG_TEXT', 'NUMERIC', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "QuizGradingType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuestType" AS ENUM ('QUIZ', 'ASSIGNMENT', 'PROJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuestSubmissionType" AS ENUM ('TEXT', 'LINK', 'FILE');

-- CreateEnum
CREATE TYPE "QuestSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "learning_modules" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content_url" TEXT,
    "order_no" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "moduleId" UUID,
    "time_limit_sec" INTEGER,
    "pass_all_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "QuizQuestionType" NOT NULL,
    "order_no" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "grading_type" "QuizGradingType" NOT NULL DEFAULT 'AUTO',
    "answer_key" JSONB,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_choices" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "choice_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order_no" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,
    "attempt_no" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempt_answers" (
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer_text" TEXT,
    "answer_number" DECIMAL(18,6),
    "attachment_url" TEXT,
    "is_correct" BOOLEAN,
    "awarded_points" INTEGER,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_attempt_answers_pkey" PRIMARY KEY ("attemptId","questionId")
);

-- CreateTable
CREATE TABLE "quiz_attempt_answer_choices" (
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "choiceId" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempt_answer_choices_pkey" PRIMARY KEY ("attemptId","questionId","choiceId")
);

-- CreateTable
CREATE TABLE "quiz_attempt_answer_attachments" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "file_size_bytes" BIGINT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempt_answer_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quests" (
    "id" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "type" "QuestType" NOT NULL,
    "learning_module_id" UUID,
    "quiz_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reward_coins" INTEGER NOT NULL DEFAULT 0,
    "submission_type" "QuestSubmissionType",
    "status" "QuestStatus" NOT NULL DEFAULT 'DRAFT',
    "start_at" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_classrooms" (
    "questId" UUID NOT NULL,
    "classroomId" UUID NOT NULL,

    CONSTRAINT "quest_classrooms_pkey" PRIMARY KEY ("questId","classroomId")
);

-- CreateTable
CREATE TABLE "quest_submissions" (
    "id" UUID NOT NULL,
    "questId" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "status" "QuestSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "latest_version_no" INTEGER NOT NULL DEFAULT 1,
    "reviewed_by" UUID,
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_submission_versions" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "payload_json" JSONB,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_learning_progress" (
    "id" UUID NOT NULL,
    "questId" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "video_started_at" TIMESTAMP(3),
    "video_completed_at" TIMESTAMP(3),
    "is_quiz_unlocked" BOOLEAN NOT NULL DEFAULT false,
    "first_pass_attempt_id" UUID,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_learning_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_modules_termId_order_no_idx" ON "learning_modules"("termId", "order_no");

-- CreateIndex
CREATE INDEX "quizzes_moduleId_idx" ON "quizzes"("moduleId");

-- CreateIndex
CREATE INDEX "quiz_questions_quizId_order_no_idx" ON "quiz_questions"("quizId", "order_no");

-- CreateIndex
CREATE INDEX "quiz_choices_questionId_order_no_idx" ON "quiz_choices"("questionId", "order_no");

-- CreateIndex
CREATE INDEX "quiz_attempts_studentProfileId_quizId_attempt_no_idx" ON "quiz_attempts"("studentProfileId", "quizId", "attempt_no");

-- CreateIndex
CREATE INDEX "quiz_attempts_quizId_submitted_at_idx" ON "quiz_attempts"("quizId", "submitted_at");

-- CreateIndex
CREATE INDEX "quiz_attempt_answers_questionId_idx" ON "quiz_attempt_answers"("questionId");

-- CreateIndex
CREATE INDEX "quiz_attempt_answers_reviewer_id_idx" ON "quiz_attempt_answers"("reviewer_id");

-- CreateIndex
CREATE INDEX "quiz_attempt_answer_choices_choiceId_idx" ON "quiz_attempt_answer_choices"("choiceId");

-- CreateIndex
CREATE INDEX "quiz_attempt_answer_attachments_attemptId_questionId_idx" ON "quiz_attempt_answer_attachments"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "quests_termId_status_idx" ON "quests"("termId", "status");

-- CreateIndex
CREATE INDEX "quests_quiz_id_idx" ON "quests"("quiz_id");

-- CreateIndex
CREATE INDEX "quests_learning_module_id_idx" ON "quests"("learning_module_id");

-- CreateIndex
CREATE INDEX "quest_submissions_reviewed_by_idx" ON "quest_submissions"("reviewed_by");

-- CreateIndex
CREATE UNIQUE INDEX "quest_submissions_questId_studentProfileId_key" ON "quest_submissions"("questId", "studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "quest_submission_versions_submissionId_version_no_key" ON "quest_submission_versions"("submissionId", "version_no");

-- CreateIndex
CREATE INDEX "quest_learning_progress_first_pass_attempt_id_idx" ON "quest_learning_progress"("first_pass_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "quest_learning_progress_questId_studentProfileId_key" ON "quest_learning_progress"("questId", "studentProfileId");

-- AddForeignKey
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "learning_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_choices" ADD CONSTRAINT "quiz_choices_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answer_choices" ADD CONSTRAINT "quiz_attempt_answer_choices_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answer_choices" ADD CONSTRAINT "quiz_attempt_answer_choices_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answer_choices" ADD CONSTRAINT "quiz_attempt_answer_choices_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "quiz_choices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answer_attachments" ADD CONSTRAINT "quiz_attempt_answer_attachments_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answer_attachments" ADD CONSTRAINT "quiz_attempt_answer_attachments_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_learning_module_id_fkey" FOREIGN KEY ("learning_module_id") REFERENCES "learning_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_classrooms" ADD CONSTRAINT "quest_classrooms_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_classrooms" ADD CONSTRAINT "quest_classrooms_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_submissions" ADD CONSTRAINT "quest_submissions_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_submissions" ADD CONSTRAINT "quest_submissions_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_submissions" ADD CONSTRAINT "quest_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_submission_versions" ADD CONSTRAINT "quest_submission_versions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "quest_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_learning_progress" ADD CONSTRAINT "quest_learning_progress_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_learning_progress" ADD CONSTRAINT "quest_learning_progress_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_learning_progress" ADD CONSTRAINT "quest_learning_progress_first_pass_attempt_id_fkey" FOREIGN KEY ("first_pass_attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
