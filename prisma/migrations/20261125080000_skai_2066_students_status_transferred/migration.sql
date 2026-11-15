-- SKAI-2066: "Mark transferred" wrote students.status = 'transferred' and failed with 23514 (HTTP 500), because
-- students_status_check (SKAI-1852) did not list it. The roster, export and insights already treat 'transferred' as
-- off the active roll (src/lib/students/roster-status.ts), and the API accepts it, so the constraint gains the value.
-- No existing row can hold it (the old constraint refused it), so validation cannot fail.
--
-- Rollback: recreate students_status_check without 'transferred' (only after moving any 'transferred' rows).

ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_status_check";
ALTER TABLE "students" ADD CONSTRAINT "students_status_check" CHECK ("status" IN ('active', 'archived', 'consolidated', 'graduated', 'inactive', 'transferred', 'withdrawn')) NOT VALID;
ALTER TABLE "students" VALIDATE CONSTRAINT "students_status_check";
