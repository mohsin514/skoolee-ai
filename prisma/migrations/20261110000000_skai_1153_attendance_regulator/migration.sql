-- SKAI-1153: per-school regulator attendance code set and calendar (KHDA, ADEK, SPEA, MOE).
-- Backwards-compatible: every existing school takes NONE, which keeps today's register exactly as it is.

ALTER TABLE "schools" ADD COLUMN "attendance_regulator" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "schools"
  ADD CONSTRAINT "schools_attendance_regulator_check" CHECK ("attendance_regulator" IN ('NONE', 'KHDA', 'ADEK', 'SPEA', 'MOE'));
