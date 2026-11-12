-- SKAI-1845 (DB-01 Phase 1c): a row cannot point at another school's campus.
--
-- These 14 tables carry both school_id and campus_id, but the foreign key covered campus_id alone, so a row in
-- school A could name a campus of school B. The campus foreign key now covers (school_id, campus_id) and
-- references campuses(school_id, id), backed by a new unique (school_id, id) on campuses. ON DELETE behaviour
-- is unchanged (CASCADE for setup tables, NO ACTION for money and grade records from SKAI-1805).
--
-- Order: indexes first, then the new composite keys, then the old single-column keys are dropped, so no
-- table is ever without a campus foreign key. Fails if a row's campus belongs to another school; dev was
-- checked on 2026-11-13 and had none across 6,600+ rows.
-- Rollback: re-add <table>_campus_id_fkey on (campus_id) and drop <table>_school_id_campus_id_fkey.

CREATE UNIQUE INDEX IF NOT EXISTS "campuses_school_id_id_key" ON "campuses"("school_id", "id");
CREATE INDEX "subjects_school_id_campus_id_idx" ON "subjects"("school_id", "campus_id");
CREATE INDEX "students_school_id_campus_id_idx" ON "students"("school_id", "campus_id");
CREATE INDEX "report_cards_school_id_campus_id_idx" ON "report_cards"("school_id", "campus_id");
CREATE INDEX "payments_school_id_campus_id_idx" ON "payments"("school_id", "campus_id");
CREATE INDEX "payment_plans_school_id_campus_id_idx" ON "payment_plans"("school_id", "campus_id");
CREATE INDEX "online_payment_orders_school_id_campus_id_idx" ON "online_payment_orders"("school_id", "campus_id");
CREATE INDEX "marks_school_id_campus_id_idx" ON "marks"("school_id", "campus_id");
CREATE INDEX "ledger_entries_school_id_campus_id_idx" ON "ledger_entries"("school_id", "campus_id");
CREATE INDEX "invoices_school_id_campus_id_idx" ON "invoices"("school_id", "campus_id");
CREATE INDEX "exams_school_id_campus_id_idx" ON "exams"("school_id", "campus_id");
CREATE INDEX "classes_school_id_campus_id_idx" ON "classes"("school_id", "campus_id");
CREATE INDEX "attendance_school_id_campus_id_idx" ON "attendance"("school_id", "campus_id");

ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marks" ADD CONSTRAINT "marks_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "online_payment_orders" ADD CONSTRAINT "online_payment_orders_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_school_id_campus_id_fkey" FOREIGN KEY ("school_id", "campus_id") REFERENCES "campuses"("school_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "classes" DROP CONSTRAINT "classes_campus_id_fkey";
ALTER TABLE "students" DROP CONSTRAINT "students_campus_id_fkey";
ALTER TABLE "guardian_relationships" DROP CONSTRAINT "guardian_relationships_campus_id_fkey";
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_campus_id_fkey";
ALTER TABLE "exams" DROP CONSTRAINT "exams_campus_id_fkey";
ALTER TABLE "marks" DROP CONSTRAINT "marks_campus_id_fkey";
ALTER TABLE "report_cards" DROP CONSTRAINT "report_cards_campus_id_fkey";
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_campus_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_campus_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_campus_id_fkey";
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_campus_id_fkey";
ALTER TABLE "online_payment_orders" DROP CONSTRAINT "online_payment_orders_campus_id_fkey";
ALTER TABLE "payment_plans" DROP CONSTRAINT "payment_plans_campus_id_fkey";
ALTER TABLE "financial_adjustments" DROP CONSTRAINT "financial_adjustments_campus_id_fkey";
