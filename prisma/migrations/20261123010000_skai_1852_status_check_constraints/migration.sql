-- SKAI-1852 (DB-01 Phase 2b): the watched status columns only accept their known values.
--
-- SKAI-1808 watched these 10 columns with a trigger that logged unknown values to status_value_violations
-- without blocking writes. The log stayed empty on dev, and every existing row already uses a listed value
-- (checked 2026-11-13). Each column now has one CHECK constraint, <table>_status_check, generated from
-- src/lib/db/status-values.ts, and its watch trigger is dropped (the watch function and log table stay for the
-- next batch of columns).
--
-- Three tables already had a status check from their own feature migrations; they are replaced by the
-- conventionally named one with the same values: admission_applications (same list), assignments
-- (assignment_status, same list) and complaints (OPEN, IN_PROGRESS, RESOLVED: the app list wrongly also had
-- CLOSED, which the database already refused). guardian_relationships gains REVIEW_REQUIRED, a status the
-- code writes that the first list missed.
--
-- Rollback: ALTER TABLE <table> DROP CONSTRAINT <table>_status_check; and recreate the watch trigger from
-- 20261119120000_skai_1808_status_value_watch.

DROP TRIGGER IF EXISTS "exams_status_watch" ON "exams";
ALTER TABLE "exams" DROP CONSTRAINT IF EXISTS "exams_status_check";
ALTER TABLE "exams" ADD CONSTRAINT "exams_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'MARKS_ENTRY', 'LOCKED', 'PRINCIPAL_REVIEWED', 'PUBLISHED')) NOT VALID;
ALTER TABLE "exams" VALIDATE CONSTRAINT "exams_status_check";

DROP TRIGGER IF EXISTS "students_status_watch" ON "students";
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_status_check";
ALTER TABLE "students" ADD CONSTRAINT "students_status_check" CHECK ("status" IN ('active', 'archived', 'consolidated', 'graduated', 'inactive', 'withdrawn')) NOT VALID;
ALTER TABLE "students" VALIDATE CONSTRAINT "students_status_check";

DROP TRIGGER IF EXISTS "classes_status_watch" ON "classes";
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_status_check";
ALTER TABLE "classes" ADD CONSTRAINT "classes_status_check" CHECK ("status" IN ('ACTIVE', 'COMPLETED')) NOT VALID;
ALTER TABLE "classes" VALIDATE CONSTRAINT "classes_status_check";

DROP TRIGGER IF EXISTS "academic_cycles_status_watch" ON "academic_cycles";
ALTER TABLE "academic_cycles" DROP CONSTRAINT IF EXISTS "academic_cycles_status_check";
ALTER TABLE "academic_cycles" ADD CONSTRAINT "academic_cycles_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')) NOT VALID;
ALTER TABLE "academic_cycles" VALIDATE CONSTRAINT "academic_cycles_status_check";

DROP TRIGGER IF EXISTS "guardian_relationships_status_watch" ON "guardian_relationships";
ALTER TABLE "guardian_relationships" DROP CONSTRAINT IF EXISTS "guardian_relationships_status_check";
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_status_check" CHECK ("status" IN ('DRAFT', 'INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'REVIEW_REQUIRED')) NOT VALID;
ALTER TABLE "guardian_relationships" VALIDATE CONSTRAINT "guardian_relationships_status_check";

DROP TRIGGER IF EXISTS "assignments_status_watch" ON "assignments";
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignment_status";
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_status_check";
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_status_check" CHECK ("status" IN ('DRAFT', 'RELEASED', 'CLOSED')) NOT VALID;
ALTER TABLE "assignments" VALIDATE CONSTRAINT "assignments_status_check";

DROP TRIGGER IF EXISTS "leave_requests_status_watch" ON "leave_requests";
ALTER TABLE "leave_requests" DROP CONSTRAINT IF EXISTS "leave_requests_status_check";
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')) NOT VALID;
ALTER TABLE "leave_requests" VALIDATE CONSTRAINT "leave_requests_status_check";

DROP TRIGGER IF EXISTS "admission_queries_status_watch" ON "admission_queries";
ALTER TABLE "admission_queries" DROP CONSTRAINT IF EXISTS "admission_queries_status_check";
ALTER TABLE "admission_queries" ADD CONSTRAINT "admission_queries_status_check" CHECK ("status" IN ('ACTIVE', 'FOLLOW_UP', 'CONVERTED', 'LOST')) NOT VALID;
ALTER TABLE "admission_queries" VALIDATE CONSTRAINT "admission_queries_status_check";

DROP TRIGGER IF EXISTS "admission_applications_status_watch" ON "admission_applications";
ALTER TABLE "admission_applications" DROP CONSTRAINT IF EXISTS "admission_applications_status_check";
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'OFFERED', 'WAITLISTED', 'REJECTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'ENROLLED')) NOT VALID;
ALTER TABLE "admission_applications" VALIDATE CONSTRAINT "admission_applications_status_check";

DROP TRIGGER IF EXISTS "complaints_status_watch" ON "complaints";
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_status_check";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_status_check" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')) NOT VALID;
ALTER TABLE "complaints" VALIDATE CONSTRAINT "complaints_status_check";
