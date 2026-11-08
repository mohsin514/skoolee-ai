-- SKAI-193: class version token for offline sync. Additive column with a default; existing rows get now().
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "classes_school_id_updated_at_idx" ON "classes"("school_id", "updated_at");
-- Widen the offline log to class edits and refused (INVALID) edits; existing rows already satisfy the new check.
ALTER TABLE "offline_operations" DROP CONSTRAINT IF EXISTS "offline_operations_check";
ALTER TABLE "offline_operations" ADD CONSTRAINT "offline_operations_check" CHECK ("kind" IN ('ATTENDANCE_MARK','CLASS_EDIT') AND "status" IN ('ACCEPTED','CONFLICT','REJECTED_ACCESS','EXPIRED','RESOLVED_SERVER','RESOLVED_LOCAL','CORRECTION_REQUESTED','DISCARDED','INVALID'));
