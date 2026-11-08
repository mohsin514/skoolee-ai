ALTER TABLE "school_ai_exam_integrity_events" ADD COLUMN "retention_until" TIMESTAMP(3);
ALTER TABLE "audit_logs" ADD COLUMN "retention_until" TIMESTAMP(3);

-- Legacy collection had no approved finite metadata policy. Do not invent one.
UPDATE "school_ai_exam_integrity_events" SET "retention_until" = CURRENT_TIMESTAMP;
UPDATE "audit_logs" SET "retention_until" = CURRENT_TIMESTAMP
  WHERE "table_name" = 'school_ai_exam_integrity_events';

ALTER TABLE "school_ai_exam_integrity_events" ALTER COLUMN "retention_until" SET NOT NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_integrity_requires_retention"
  CHECK ("table_name" <> 'school_ai_exam_integrity_events' OR "retention_until" IS NOT NULL);
CREATE INDEX "school_ai_integrity_retention_idx" ON "school_ai_exam_integrity_events"("school_id", "retention_until");
CREATE INDEX "audit_logs_retention_idx" ON "audit_logs"("school_id", "retention_until");

CREATE OR REPLACE FUNCTION school_ai_integrity_observation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.school_id,NEW.campus_id,NEW.assignment_id,NEW.attempt_id,NEW.user_id,NEW.client_event_id,NEW.kind,NEW.observed_at,NEW.received_at,NEW.details,NEW.retention_until)
    IS DISTINCT FROM (OLD.id,OLD.school_id,OLD.campus_id,OLD.assignment_id,OLD.attempt_id,OLD.user_id,OLD.client_event_id,OLD.kind,OLD.observed_at,OLD.received_at,OLD.details,OLD.retention_until) THEN
    RAISE EXCEPTION 'Integrity observations are immutable; record a separate human review';
  END IF;
  RETURN NEW;
END;
$$;
