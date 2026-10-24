-- Additive only. Browser reports are observations, never automatic misconduct decisions.
CREATE TABLE "school_ai_exam_integrity_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "client_event_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PAGE_HIDDEN','PAGE_VISIBLE','WINDOW_BLURRED','WINDOW_FOCUSED','CAMERA_STARTED','CAMERA_ENDED','CAMERA_UNAVAILABLE','CAPTURE_UPLOAD_FAILED')),
  "observed_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "details" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "decision" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("decision" IN ('PENDING','DISMISSED','NOTED','FOLLOW_UP')),
  "review_reason" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  CONSTRAINT "school_ai_integrity_assignment_scope_fkey" FOREIGN KEY ("assignment_id","school_id","campus_id") REFERENCES "school_ai_exam_assignments"("id","school_id","campus_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "school_ai_integrity_attempt_scope_fkey" FOREIGN KEY ("attempt_id","school_id","campus_id") REFERENCES "school_ai_exam_attempts"("id","school_id","campus_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "school_ai_integrity_review_complete" CHECK (("decision" = 'PENDING' AND "review_reason" IS NULL AND "reviewed_by_id" IS NULL AND "reviewed_at" IS NULL) OR ("decision" <> 'PENDING' AND length("review_reason") >= 3 AND "reviewed_by_id" IS NOT NULL AND "reviewed_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "school_ai_exam_integrity_events_attempt_id_client_event_id_key" ON "school_ai_exam_integrity_events"("attempt_id","client_event_id");
CREATE INDEX "school_ai_integrity_scope_received_idx" ON "school_ai_exam_integrity_events"("school_id","campus_id","assignment_id","received_at");
ALTER TABLE "school_ai_exam_integrity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_integrity_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_ai_exam_integrity_events" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));

CREATE FUNCTION school_ai_integrity_observation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.school_id,NEW.campus_id,NEW.assignment_id,NEW.attempt_id,NEW.user_id,NEW.client_event_id,NEW.kind,NEW.observed_at,NEW.received_at,NEW.details)
    IS DISTINCT FROM (OLD.id,OLD.school_id,OLD.campus_id,OLD.assignment_id,OLD.attempt_id,OLD.user_id,OLD.client_event_id,OLD.kind,OLD.observed_at,OLD.received_at,OLD.details) THEN
    RAISE EXCEPTION 'Integrity observations are immutable; record a separate human review';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER school_ai_integrity_observation_immutable BEFORE UPDATE ON "school_ai_exam_integrity_events" FOR EACH ROW EXECUTE FUNCTION school_ai_integrity_observation_immutable();
