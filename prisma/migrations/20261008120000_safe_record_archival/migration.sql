ALTER TABLE "campuses" ADD COLUMN "archived_at" TIMESTAMP(3), ADD COLUMN "archive_reason" TEXT;
ALTER TABLE "classes" ADD COLUMN "archived_at" TIMESTAMP(3), ADD COLUMN "archive_reason" TEXT, ADD COLUMN "archive_previous_status" TEXT;
ALTER TABLE "students" ADD COLUMN "archived_at" TIMESTAMP(3), ADD COLUMN "archive_reason" TEXT;

DROP INDEX IF EXISTS "students_school_id_admission_no_key";
DROP INDEX IF EXISTS "students_campus_id_roll_no_key";
CREATE UNIQUE INDEX "students_active_school_admission_no_key"
  ON "students"("school_id", "admission_no") WHERE "archived_at" IS NULL AND "admission_no" IS NOT NULL;
CREATE UNIQUE INDEX "students_active_campus_roll_no_key"
  ON "students"("campus_id", "roll_no") WHERE "archived_at" IS NULL;
