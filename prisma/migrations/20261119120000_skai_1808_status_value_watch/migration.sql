-- SKAI-1808 (DB-01 Phase 2a): watch free-text status columns before constraining them.
--
-- 10 status columns accept any text. Their allowed values (src/lib/db/status-values.ts) were collected from
-- every write and comparison in the app and from dev data, but some writes take their value from a variable,
-- so a CHECK constraint today could break a flow nobody traced. Instead, an AFTER trigger records any value
-- outside the list in status_value_violations (one row per table, column and value, with a count) and lets
-- the write through. Once the table stays empty for a release, the same lists become CHECK constraints.
--
-- Rollback: DROP TRIGGER <table>_status_watch ON <table>; DROP FUNCTION note_unknown_status_value();
-- DROP TABLE status_value_violations.

-- CreateTable
CREATE TABLE "status_value_violations" (
    "id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "column_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_value_violations_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "status_value_violations_table_name_column_name_value_key" ON "status_value_violations"("table_name", "column_name", "value");

CREATE FUNCTION note_unknown_status_value() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE val text := to_jsonb(NEW) ->> TG_ARGV[0];
BEGIN
  IF val IS NOT NULL AND NOT (val = ANY (TG_ARGV[1:])) THEN
    INSERT INTO status_value_violations (id, table_name, column_name, value)
    VALUES (gen_random_uuid()::text, TG_TABLE_NAME, TG_ARGV[0], val)
    ON CONFLICT (table_name, column_name, value)
    DO UPDATE SET occurrences = status_value_violations.occurrences + 1, last_seen_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "exams_status_watch" AFTER INSERT OR UPDATE OF "status" ON "exams"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'DRAFT', 'ACTIVE', 'MARKS_ENTRY', 'LOCKED', 'PRINCIPAL_REVIEWED', 'PUBLISHED');
CREATE TRIGGER "students_status_watch" AFTER INSERT OR UPDATE OF "status" ON "students"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'active', 'archived', 'consolidated', 'graduated', 'inactive', 'withdrawn');
CREATE TRIGGER "classes_status_watch" AFTER INSERT OR UPDATE OF "status" ON "classes"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'ACTIVE', 'COMPLETED');
CREATE TRIGGER "academic_cycles_status_watch" AFTER INSERT OR UPDATE OF "status" ON "academic_cycles"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
CREATE TRIGGER "guardian_relationships_status_watch" AFTER INSERT OR UPDATE OF "status" ON "guardian_relationships"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'DRAFT', 'INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TRIGGER "assignments_status_watch" AFTER INSERT OR UPDATE OF "status" ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'DRAFT', 'RELEASED', 'CLOSED');
CREATE TRIGGER "leave_requests_status_watch" AFTER INSERT OR UPDATE OF "status" ON "leave_requests"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TRIGGER "admission_queries_status_watch" AFTER INSERT OR UPDATE OF "status" ON "admission_queries"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'ACTIVE', 'FOLLOW_UP', 'CONVERTED', 'LOST');
CREATE TRIGGER "admission_applications_status_watch" AFTER INSERT OR UPDATE OF "status" ON "admission_applications"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'OFFERED', 'WAITLISTED', 'REJECTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'ENROLLED');
CREATE TRIGGER "complaints_status_watch" AFTER INSERT OR UPDATE OF "status" ON "complaints"
  FOR EACH ROW EXECUTE FUNCTION note_unknown_status_value('status', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
