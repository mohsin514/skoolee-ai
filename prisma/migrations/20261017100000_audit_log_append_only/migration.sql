-- SKO-476: audit events are append-only; holds can expire.
ALTER TABLE "data_legal_holds" ADD COLUMN "expires_at" TIMESTAMP(3);
ALTER TABLE "data_legal_holds" ADD CONSTRAINT "data_hold_audit_expiry" CHECK ("category" <> 'AUDIT_LOG' OR "expires_at" IS NOT NULL);

-- Corrections are new events. A row may only leave when its school is deleted, or
-- once its retention has ended and no active AUDIT_LOG hold covers it.
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
    IF OLD.retention_until IS NULL OR OLD.retention_until > CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Audit events are append-only until their retention ends';
    END IF;
    IF EXISTS (SELECT 1 FROM data_legal_holds hold WHERE hold.school_id = OLD.school_id AND hold.category = 'AUDIT_LOG'
      AND hold.released_at IS NULL AND (hold.expires_at IS NULL OR hold.expires_at > CURRENT_TIMESTAMP)
      AND (hold.record_id IS NULL OR hold.record_id = OLD.id)) THEN
      RAISE EXCEPTION 'This audit event is preserved by a legal hold';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audit events are append-only; record a correction as a new event';
END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
