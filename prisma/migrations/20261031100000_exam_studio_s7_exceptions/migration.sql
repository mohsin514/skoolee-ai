-- SKO-506: exam exceptions that block report-card publication while open.
-- CreateTable
CREATE TABLE "exam_exceptions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "resolution" TEXT,
    "created_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_exceptions_school_id_exam_id_status_idx" ON "exam_exceptions"("school_id", "exam_id", "status");

-- CreateIndex
CREATE INDEX "exam_exceptions_school_id_student_id_idx" ON "exam_exceptions"("school_id", "student_id");

