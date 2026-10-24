-- SKO-500 (SKO-408 slice 1): the Exam Chain — taught boundary and paper slots.
-- Purely additive: two new tables and nullable columns. No existing row is read or written.

-- AlterTable
ALTER TABLE "campuses" ADD COLUMN     "exam_coordinator_user_id" TEXT;

-- AlterTable
ALTER TABLE "exam_sessions" ADD COLUMN     "paper_due_on" DATE,
ADD COLUMN     "paper_policy" JSONB;

-- AlterTable
ALTER TABLE "exam_schedules" ADD COLUMN     "paper_slot_id" TEXT;

-- AlterTable
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN     "exam_schedule_id" TEXT,
ADD COLUMN     "paper_slot_id" TEXT;

-- CreateTable
CREATE TABLE "teaching_progress" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "curriculum_version" INTEGER NOT NULL,
    "outcome_id" TEXT NOT NULL,
    "taught_on" DATE NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timetable_slot_id" TEXT,
    "teacher_id" TEXT NOT NULL,
    "note" TEXT,
    "evidence_source_id" TEXT,

    CONSTRAINT "teaching_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_slots" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "exam_session_id" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "grade_name" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_on" DATE NOT NULL,
    "marks_due_on" DATE,
    "total_marks" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "delivery_kind" TEXT NOT NULL DEFAULT 'PAPER',
    "languages" JSONB NOT NULL DEFAULT '["en"]',
    "form_count" INTEGER NOT NULL DEFAULT 1,
    "coverage_rule" TEXT NOT NULL DEFAULT 'TAUGHT',
    "explicit_coverage" JSONB,
    "author_user_id" TEXT,
    "moderator_user_id" TEXT,
    "marker_overrides" JSONB,
    "brief_record_id" TEXT,
    "paper_record_id" TEXT,
    "paper_version" INTEGER,
    "form_release_id" TEXT,
    "sealed_at" TIMESTAMP(3),
    "sealed_sitting_date" DATE,
    "copies_requested" INTEGER,
    "printed_by_id" TEXT,
    "printed_at" TIMESTAMP(3),
    "printed_hash" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "last_nudge_at" TIMESTAMP(3),
    "nudge_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_paper_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teaching_progress_school_id_campus_id_subject_id_class_id_t_idx" ON "teaching_progress"("school_id", "campus_id", "subject_id", "class_id", "taught_on");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_progress_school_id_campus_id_subject_id_class_id_c_key" ON "teaching_progress"("school_id", "campus_id", "subject_id", "class_id", "curriculum_id", "outcome_id");

-- CreateIndex
CREATE INDEX "exam_paper_slots_school_id_campus_id_author_user_id_due_on_idx" ON "exam_paper_slots"("school_id", "campus_id", "author_user_id", "due_on");

-- CreateIndex
CREATE INDEX "exam_paper_slots_school_id_campus_id_moderator_user_id_idx" ON "exam_paper_slots"("school_id", "campus_id", "moderator_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_slots_exam_session_id_subject_name_grade_name_key" ON "exam_paper_slots"("exam_session_id", "subject_name", "grade_name");

-- CreateIndex
CREATE INDEX "exam_schedules_paper_slot_id_idx" ON "exam_schedules"("paper_slot_id");

-- CreateIndex
CREATE INDEX "school_ai_exam_assignments_school_id_campus_id_paper_slot_i_idx" ON "school_ai_exam_assignments"("school_id", "campus_id", "paper_slot_id");

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_paper_slot_id_fkey" FOREIGN KEY ("paper_slot_id") REFERENCES "exam_paper_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_slots" ADD CONSTRAINT "exam_paper_slots_exam_session_id_fkey" FOREIGN KEY ("exam_session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
