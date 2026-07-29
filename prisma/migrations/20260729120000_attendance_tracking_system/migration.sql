-- AlterTable: Add new columns to attendance
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "class_id" TEXT;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);

-- Backfill class_id from student's current class
UPDATE "attendance" a
SET "class_id" = s."class_id"
FROM "students" s
WHERE a."student_id" = s."id"
  AND a."class_id" IS NULL;

-- CreateTable: attendance_edit_history
CREATE TABLE IF NOT EXISTS "attendance_edit_history" (
    "id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "old_status" TEXT NOT NULL,
    "new_status" TEXT NOT NULL,
    "edited_by" TEXT,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_class_id_date_idx" ON "attendance"("class_id", "date");
CREATE INDEX IF NOT EXISTS "attendance_campus_id_date_idx" ON "attendance"("campus_id", "date");
CREATE INDEX IF NOT EXISTS "attendance_edit_history_attendance_id_idx" ON "attendance_edit_history"("attendance_id");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_edit_history" ADD CONSTRAINT "attendance_edit_history_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
