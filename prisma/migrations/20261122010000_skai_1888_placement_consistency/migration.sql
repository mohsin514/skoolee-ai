-- SKAI-1888 (DB-01 Phase 3c): a student's placement always matches their open enrollment.
--
-- The enrollment is the source of truth for where a student sits; students.class_id/campus_id/roll_no is
-- a copy that list queries read. The app keeps them equal today (dev: 0 drift), but nothing in the database
-- guaranteed it. These deferred constraint triggers check every touched student at commit, so a transaction
-- may update the two tables in either order:
--   1. at most one open enrollment per student;
--   2. if there is one, the student's class, campus and roll number equal it;
--   3. an active, not archived, not consolidated student has one.
-- Administrative archive keeps the enrollment open on purpose (restore puts the pupil back), so archived
-- students are not forced either way. LEGACY-origin enrollments are imported history and are ignored, as the
-- existing enrollment triggers do. Hard deletes of enrollments are not checked: the app never deletes them,
-- and the only deletes (a whole-school purge, test teardown) remove the students too.
--
-- Rollback: DROP TRIGGER students_placement_consistency ON students;
--           DROP TRIGGER student_enrollments_placement_consistency ON student_enrollments;
--           DROP FUNCTION check_student_placement(); DROP FUNCTION check_student_placement_for(text);

CREATE FUNCTION check_student_placement_for(pupil_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s record; open_count int; e record;
BEGIN
  SELECT id, class_id, campus_id, roll_no, status, archived_at, consolidated_into_id INTO s FROM students WHERE id = pupil_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO open_count FROM student_enrollments
   WHERE student_id = pupil_id AND end_date IS NULL AND origin NOT LIKE 'LEGACY%';
  IF open_count > 1 THEN
    RAISE EXCEPTION 'Student % has % open enrollments; only one is allowed', pupil_id, open_count USING ERRCODE = 'check_violation';
  ELSIF open_count = 1 THEN
    SELECT class_id, campus_id, roll_no INTO e FROM student_enrollments
     WHERE student_id = pupil_id AND end_date IS NULL AND origin NOT LIKE 'LEGACY%';
    IF (s.class_id, s.campus_id, s.roll_no) IS DISTINCT FROM (e.class_id, e.campus_id, e.roll_no) THEN
      RAISE EXCEPTION 'Student % placement (class, campus, roll) does not match the open enrollment', pupil_id USING ERRCODE = 'check_violation';
    END IF;
  ELSIF s.status = 'active' AND s.archived_at IS NULL AND s.consolidated_into_id IS NULL THEN
    RAISE EXCEPTION 'Active student % has no open enrollment', pupil_id USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE FUNCTION check_student_placement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'students' THEN
    PERFORM check_student_placement_for(NEW.id);
  ELSE
    PERFORM check_student_placement_for(NEW.student_id);
    IF TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id THEN
      PERFORM check_student_placement_for(OLD.student_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER students_placement_consistency
  AFTER INSERT OR UPDATE OF class_id, campus_id, roll_no, status, archived_at, consolidated_into_id ON students
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_student_placement();
CREATE CONSTRAINT TRIGGER student_enrollments_placement_consistency
  AFTER INSERT OR UPDATE ON student_enrollments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_student_placement();
