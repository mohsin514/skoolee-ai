ALTER TABLE "audit_logs"
  ADD COLUMN "campus_id" TEXT;

UPDATE "audit_logs" AS audit
  SET "campus_id" = event."campus_id"
  FROM "school_ai_exam_integrity_events" AS event
  WHERE audit."table_name" = 'school_ai_exam_integrity_events'
    AND audit."record_id" = event."id"
    AND audit."school_id" = event."school_id";

CREATE INDEX "audit_logs_school_id_campus_id_created_at_idx"
  ON "audit_logs"("school_id", "campus_id", "created_at" DESC);
