-- SKO-504: family result notes and the per-session release opt-in.
-- AlterTable
ALTER TABLE "exam_sessions" ADD COLUMN     "family_notes_on_release" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "family_result_notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "result_version" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "sentence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "sent_by_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_result_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_result_notes_school_id_campus_id_assignment_id_idx" ON "family_result_notes"("school_id", "campus_id", "assignment_id");

-- CreateIndex
CREATE INDEX "family_result_notes_school_id_student_id_status_idx" ON "family_result_notes"("school_id", "student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "family_result_notes_attempt_id_key" ON "family_result_notes"("attempt_id");

