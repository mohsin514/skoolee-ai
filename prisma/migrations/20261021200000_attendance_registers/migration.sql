-- SKO-405: late/excused/partial statuses, dated class registers, versioned attendance rules, reasoned corrections and guardian explanations.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttendanceStatus" ADD VALUE 'LATE';
ALTER TYPE "AttendanceStatus" ADD VALUE 'EXCUSED';
ALTER TYPE "AttendanceStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "arrival_time" TEXT,
ADD COLUMN     "departure_time" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "attendance_edit_history" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'REGISTER';

-- CreateTable
CREATE TABLE "attendance_registers" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "roster_count" INTEGER NOT NULL DEFAULT 0,
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_rule_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "attended" TEXT[],
    "excluded" TEXT[],
    "note" TEXT,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_explanations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposed_status" TEXT NOT NULL,
    "arrival_time" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_registers_campus_id_date_idx" ON "attendance_registers"("campus_id", "date");

-- CreateIndex
CREATE INDEX "attendance_registers_school_id_idx" ON "attendance_registers"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_registers_class_id_date_key" ON "attendance_registers"("class_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_rule_versions_school_id_version_key" ON "attendance_rule_versions"("school_id", "version");

-- CreateIndex
CREATE INDEX "attendance_explanations_campus_id_status_idx" ON "attendance_explanations"("campus_id", "status");

-- CreateIndex
CREATE INDEX "attendance_explanations_attendance_id_idx" ON "attendance_explanations"("attendance_id");

-- CreateIndex
CREATE INDEX "attendance_explanations_school_id_idx" ON "attendance_explanations"("school_id");

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_rule_versions" ADD CONSTRAINT "attendance_rule_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_explanations" ADD CONSTRAINT "attendance_explanations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_explanations" ADD CONSTRAINT "attendance_explanations_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_status_check" CHECK (status IN ('OPEN', 'SUBMITTED'));
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_submitted_check" CHECK (status <> 'SUBMITTED' OR (submitted_at IS NOT NULL AND submitted_by_id IS NOT NULL));
ALTER TABLE "attendance_explanations" ADD CONSTRAINT "attendance_explanations_status_check" CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CLARIFICATION'));
ALTER TABLE "attendance_explanations" ADD CONSTRAINT "attendance_explanations_proposed_check" CHECK (proposed_status IN ('EXCUSED', 'LATE'));
-- One open explanation per register entry at a time.
CREATE UNIQUE INDEX "attendance_explanations_one_open" ON "attendance_explanations" ("attendance_id") WHERE status IN ('PENDING', 'CLARIFICATION');
ALTER TABLE "attendance_edit_history" ADD CONSTRAINT "attendance_edit_history_source_check" CHECK (source IN ('REGISTER', 'CORRECTION', 'EXPLANATION'));
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_times_check" CHECK ((arrival_time IS NULL OR arrival_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND (departure_time IS NULL OR departure_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));
