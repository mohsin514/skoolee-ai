-- A partial index bounds due-attempt discovery without indexing completed exams.
-- Prisma does not model PostgreSQL partial indexes; keep this migration intact.
CREATE INDEX "school_ai_exam_attempts_due_idx"
ON "school_ai_exam_attempts" ("deadline_at", "id")
WHERE "status" = 'IN_PROGRESS';
