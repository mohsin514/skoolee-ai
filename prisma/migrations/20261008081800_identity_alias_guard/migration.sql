ALTER TABLE students ADD CONSTRAINT students_consolidated_into_id_fkey FOREIGN KEY (consolidated_into_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE FUNCTION identity_alias_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.consolidated_into_id IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Consolidated identity is read-only'; END IF;
 IF NEW.consolidated_into_id IS NOT NULL THEN
  IF NEW.id=NEW.consolidated_into_id OR NOT EXISTS(SELECT 1 FROM students s WHERE s.id=NEW.consolidated_into_id AND s.school_id=NEW.school_id AND s.consolidated_into_id IS NULL) THEN RAISE EXCEPTION 'Invalid identity consolidation target'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_alias_guard BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION identity_alias_guard();
CREATE FUNCTION source_active_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM students WHERE id=NEW.student_id AND consolidated_into_id IS NOT NULL) THEN RAISE EXCEPTION 'Consolidated identity cannot receive new source records'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attendance_active_identity BEFORE INSERT ON attendance FOR EACH ROW EXECUTE FUNCTION source_active_identity_guard();
CREATE TRIGGER invoice_active_identity BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION source_active_identity_guard();
CREATE TRIGGER report_active_identity BEFORE INSERT ON report_cards FOR EACH ROW EXECUTE FUNCTION source_active_identity_guard();
-- Roll number belongs to the enrollment snapshot. Changing the current roll
-- cannot invalidate or withdraw a published report from a previous period.
DROP TRIGGER IF EXISTS report_student_edit ON students;
CREATE TRIGGER report_student_edit AFTER UPDATE OF full_name ON students FOR EACH ROW EXECUTE FUNCTION report_source_edit();
