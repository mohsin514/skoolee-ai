-- SKAI-1819 (PERF-01): index the columns the library desk, campus dashboards, report/analytics pages and the
-- exam-room Extend button filter on, so those lookups stop scanning whole tables as data grows.
-- Additive indexes only; no data changes. Plain CREATE INDEX because Prisma runs a migration inside a transaction.
-- Rollback: DROP INDEX IF EXISTS each index named below.
CREATE INDEX IF NOT EXISTS "book_issues_member_id_returned_at_idx" ON "book_issues"("member_id", "returned_at");
CREATE INDEX IF NOT EXISTS "book_issues_book_id_idx" ON "book_issues"("book_id");
CREATE INDEX IF NOT EXISTS "book_issues_school_id_returned_at_due_at_idx" ON "book_issues"("school_id", "returned_at", "due_at");
CREATE INDEX IF NOT EXISTS "exams_campus_id_academic_year_idx" ON "exams"("campus_id", "academic_year");
CREATE INDEX IF NOT EXISTS "classes_campus_id_idx" ON "classes"("campus_id");
CREATE INDEX IF NOT EXISTS "report_cards_exam_id_idx" ON "report_cards"("exam_id");
CREATE INDEX IF NOT EXISTS "report_cards_campus_id_generated_at_idx" ON "report_cards"("campus_id", "generated_at");
CREATE INDEX IF NOT EXISTS "audit_logs_school_id_table_name_record_id_idx" ON "audit_logs"("school_id", "table_name", "record_id");
