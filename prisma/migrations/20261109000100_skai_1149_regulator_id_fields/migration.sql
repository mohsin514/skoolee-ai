-- SKAI-1149: UAE regulator field set (Emirates ID, nationality, ADEK eSIS / MOE ID) on student and staff records.
-- Backwards-compatible: every column is nullable and nothing existing reads it. students.nationality already exists.

ALTER TABLE "students" ADD COLUMN "emirates_id" TEXT;
ALTER TABLE "students" ADD COLUMN "regulator_id" TEXT;

ALTER TABLE "staff_profiles" ADD COLUMN "emirates_id" TEXT;
ALTER TABLE "staff_profiles" ADD COLUMN "nationality" TEXT;
ALTER TABLE "staff_profiles" ADD COLUMN "regulator_id" TEXT;

-- Lookups for regulator returns stay inside one school.
CREATE INDEX "students_school_id_emirates_id_idx" ON "students"("school_id", "emirates_id");
CREATE INDEX "staff_profiles_school_id_emirates_id_idx" ON "staff_profiles"("school_id", "emirates_id");
