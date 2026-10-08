-- Module 10 — Payroll
-- Amounts in paisa (Int). Net = basic + allowances − deductions + bonus.
-- A PAID line is immutable; DRAFT runs may be regenerated.

CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generated_by_id" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "basic" INTEGER NOT NULL DEFAULT 0,
    "allowances" INTEGER NOT NULL DEFAULT 0,
    "deductions" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL DEFAULT 0,
    "breakdown_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "payment_method_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_runs_campus_id_month_year_key" ON "payroll_runs"("campus_id", "month", "year");
CREATE UNIQUE INDEX "payroll_lines_payroll_run_id_user_id_key" ON "payroll_lines"("payroll_run_id", "user_id");
CREATE INDEX "payroll_lines_user_id_idx" ON "payroll_lines"("user_id");
CREATE INDEX "payroll_lines_status_idx" ON "payroll_lines"("status");

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method_refs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries" ADD COLUMN "payroll_line_id" TEXT;
CREATE UNIQUE INDEX "ledger_entries_payroll_line_id_key" ON "ledger_entries"("payroll_line_id");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payroll_line_id_fkey" FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
