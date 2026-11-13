-- SKAI-1885 (PERF-01): index the invoice list order, the overdue-balance aggregates, the notification inbox order
-- and a teacher's teaching assignments, so those reads stop sorting or filtering every row in their scope.
-- The other columns named in the ticket (students.class_id, exams.class_id, exams(campus_id, academic_year),
-- subjects.teacher_id, report_cards.exam_id, classes.class_teacher_id) are already indexed by SKAI-1806 / SKAI-1819.
-- Additive indexes only; no data changes. Plain CREATE INDEX because Prisma runs a migration inside a transaction.
-- Rollback: DROP INDEX IF EXISTS each index named below.
CREATE INDEX IF NOT EXISTS "invoices_campus_id_invoice_date_id_idx" ON "invoices"("campus_id", "invoice_date" DESC, "id");
CREATE INDEX IF NOT EXISTS "invoices_campus_id_currency_due_date_idx" ON "invoices"("campus_id", "currency", "due_date");
-- NULLS LAST matches listInbox's `lastRemindedAt: { sort: "desc", nulls: "last" }`; the schema declares the same columns.
CREATE INDEX IF NOT EXISTS "notifications_user_id_last_reminded_at_created_at_idx" ON "notifications"("user_id", "last_reminded_at" DESC NULLS LAST, "created_at" DESC);
CREATE INDEX IF NOT EXISTS "teaching_assignments_school_id_teacher_id_idx" ON "teaching_assignments"("school_id", "teacher_id");
