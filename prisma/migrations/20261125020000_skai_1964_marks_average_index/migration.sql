-- SKAI-1964: the principal dashboard averages every mark of its campus on each load. With marks_obtained in the
-- index, Postgres answers AVG(marks_obtained) WHERE school_id = $1 AND campus_id = $2 with an index-only scan
-- instead of reading the table (qa-big, about 97k marks per campus: 34-96 ms down to about 6 ms).
-- Index only: no column, constraint or data change. Plain CREATE INDEX briefly blocks writes to marks while it
-- builds; for a large production table, build it first with CREATE INDEX CONCURRENTLY under the same name and
-- IF NOT EXISTS skips it here. Rollback: DROP INDEX "marks_school_id_campus_id_marks_obtained_idx".

CREATE INDEX IF NOT EXISTS "marks_school_id_campus_id_marks_obtained_idx" ON "marks"("school_id", "campus_id", "marks_obtained");
