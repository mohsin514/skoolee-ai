-- SKO-503 (Exam Studio slice 3): paper sittings — scripts, room-sheet attendance, print runs. Additive only.

-- AlterTable
ALTER TABLE "exam_paper_slots" ADD COLUMN     "spare_copies_percent" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "exam_paper_scripts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "candidate_no" INTEGER NOT NULL,
    "seal_prefix" TEXT NOT NULL,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned_at" TIMESTAMP(3),
    "scanned_by_id" TEXT,
    "page_keys" JSONB NOT NULL DEFAULT '[]',
    "marks" JSONB,
    "total" DOUBLE PRECISION,
    "marked_by_id" TEXT,
    "marked_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "exam_paper_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attendance" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopened_at" TIMESTAMP(3),
    "reopened_by_id" TEXT,
    "reopen_reason" TEXT,

    CONSTRAINT "exam_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_print_runs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "group_label" TEXT NOT NULL,
    "candidates" INTEGER NOT NULL,
    "copies" INTEGER NOT NULL,
    "seal_prefix" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_print_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_paper_scripts_school_id_campus_id_slot_id_idx" ON "exam_paper_scripts"("school_id", "campus_id", "slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_scripts_schedule_id_student_id_key" ON "exam_paper_scripts"("schedule_id", "student_id");

-- CreateIndex
CREATE INDEX "exam_attendance_school_id_campus_id_schedule_id_idx" ON "exam_attendance"("school_id", "campus_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attendance_schedule_id_student_id_key" ON "exam_attendance"("schedule_id", "student_id");

-- CreateIndex
CREATE INDEX "exam_print_runs_school_id_campus_id_slot_id_idx" ON "exam_print_runs"("school_id", "campus_id", "slot_id");

