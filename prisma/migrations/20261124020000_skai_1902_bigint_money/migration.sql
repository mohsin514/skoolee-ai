-- SKAI-1902 (DB-01): bank opening balances and payroll run totals are stored as 64-bit minor units.
-- A 32-bit integer caps a value at ~21.4M PKR; a school bank account or a 500-staff payroll run can exceed it.
-- Widening int → bigint keeps every existing value, and old app builds still read and write small values.
SET lock_timeout = '10s';
ALTER TABLE "bank_accounts" ALTER COLUMN "opening_balance" TYPE BIGINT;
ALTER TABLE "payroll_calculations" ALTER COLUMN "total_net" TYPE BIGINT;
