-- SKAI-1820 (PERF-01): the stock movement list is read one page at a time per campus, newest first.
-- Additive index only; no data changes. Rollback: DROP INDEX IF EXISTS "item_transactions_school_id_campus_id_date_idx";
CREATE INDEX IF NOT EXISTS "item_transactions_school_id_campus_id_date_idx" ON "item_transactions"("school_id", "campus_id", "date");
