-- AlterTable
ALTER TABLE "school_ai_exam_appeals" ADD COLUMN     "disputed_question_ids" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "requested_outcome" TEXT;

-- CreateTable
CREATE TABLE "school_ai_result_corrections" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "from_version" INTEGER NOT NULL,
    "review" JSONB NOT NULL,
    "previous_total" DOUBLE PRECISION NOT NULL,
    "proposed_total" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "appeal_id" TEXT,
    "proposed_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_result_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_moderation_samples" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "reviewer_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "items" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_moderation_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_result_corrections_school_id_campus_id_assignment_idx" ON "school_ai_result_corrections"("school_id", "campus_id", "assignment_id", "status");

-- CreateIndex
CREATE INDEX "school_ai_result_corrections_attempt_id_from_version_idx" ON "school_ai_result_corrections"("attempt_id", "from_version");

-- CreateIndex
CREATE INDEX "school_ai_moderation_samples_school_id_campus_id_assignment_idx" ON "school_ai_moderation_samples"("school_id", "campus_id", "assignment_id");

-- CreateIndex
CREATE INDEX "school_ai_moderation_samples_reviewer_id_status_idx" ON "school_ai_moderation_samples"("reviewer_id", "status");

