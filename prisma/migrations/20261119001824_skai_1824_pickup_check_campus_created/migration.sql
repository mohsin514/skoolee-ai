-- SKAI-1824 (PERF-01): the gate queue reads today's pickup checks per campus, newest first.
-- Additive index only; no data changes. Rollback: DROP INDEX IF EXISTS "pickup_checks_school_id_campus_id_created_at_idx";
CREATE INDEX IF NOT EXISTS "pickup_checks_school_id_campus_id_created_at_idx" ON "pickup_checks"("school_id", "campus_id", "created_at");
