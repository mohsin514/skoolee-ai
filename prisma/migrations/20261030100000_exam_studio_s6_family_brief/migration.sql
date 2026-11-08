-- SKO-505: guardian acknowledgements of a published date-sheet version, per child.
-- CreateTable
CREATE TABLE "exam_brief_receipts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_brief_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_brief_receipts_school_id_version_id_idx" ON "exam_brief_receipts"("school_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_brief_receipts_version_id_student_id_guardian_user_id_key" ON "exam_brief_receipts"("version_id", "student_id", "guardian_user_id");

