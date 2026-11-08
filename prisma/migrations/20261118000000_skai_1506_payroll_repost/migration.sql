-- SKAI-1506: a reversed payroll line may be reposted. Relax one-posting-per-line to a plain index; the
-- application keeps at most one unreversed posting per line (the line's PAID claim is the guard).
DROP INDEX IF EXISTS "ledger_entries_payroll_line_id_key";
CREATE INDEX IF NOT EXISTS "ledger_entries_payroll_line_id_idx" ON "ledger_entries"("payroll_line_id");
