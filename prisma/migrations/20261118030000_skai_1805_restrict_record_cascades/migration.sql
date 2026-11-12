-- SKAI-1805 (DB-01 Phase 0a): money, grade and payroll records must survive a parent delete.
--
-- These foreign keys were ON DELETE CASCADE, so deleting a campus, exam, subject, invoice, user or an
-- original payment silently deleted payments, ledger entries, marks, report cards, attendance or
-- payroll lines. They become ON DELETE NO ACTION: a delete of the parent alone is refused while
-- records point at it.
--
-- NO ACTION rather than RESTRICT on purpose: NO ACTION is checked at the end of the statement, so a
-- whole-tenant purge that cascades from schools (which also cascades to these record tables) still
-- succeeds. RESTRICT is checked row by row and could fail such a purge depending on delete order.
--
-- Constraint swap only; no data changes. Rollback: re-create each constraint with ON DELETE CASCADE.

-- DropForeignKey
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_runs_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "payroll_lines" DROP CONSTRAINT "payroll_lines_user_id_fkey";
-- DropForeignKey
ALTER TABLE "marks" DROP CONSTRAINT "marks_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "marks" DROP CONSTRAINT "marks_exam_id_fkey";
-- DropForeignKey
ALTER TABLE "marks" DROP CONSTRAINT "marks_subject_id_fkey";
-- DropForeignKey
ALTER TABLE "report_cards" DROP CONSTRAINT "report_cards_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "report_cards" DROP CONSTRAINT "report_cards_exam_id_fkey";
-- DropForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payment_reversal_fk";
-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoice_id_fkey";
-- DropForeignKey
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "online_payment_orders" DROP CONSTRAINT "online_payment_orders_campus_id_fkey";
-- DropForeignKey
ALTER TABLE "online_payment_orders" DROP CONSTRAINT "online_payment_orders_invoice_id_fkey";
-- DropForeignKey
ALTER TABLE "financial_adjustments" DROP CONSTRAINT "financial_adjustments_campus_id_fkey";
-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payment_reversal_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "online_payment_orders" ADD CONSTRAINT "online_payment_orders_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "online_payment_orders" ADD CONSTRAINT "online_payment_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
