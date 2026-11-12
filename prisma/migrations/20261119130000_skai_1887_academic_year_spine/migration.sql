-- SKAI-1887 (DB-01 Phase 3b): classes and enrollments belong to a real academic year.
--
-- academic_cycles (one row per campus and year) is the academic-year spine; fee structures already point at
-- it. classes.academic_year and student_enrollments.academic_year were bare numbers, and some campuses had
-- classes in a year with no cycle at all, although onboarding requires an ACTIVE cycle per campus.
--
-- Product decision (2026-11-13): a class created for a year its campus has not set up gets that year as a
-- DRAFT cycle automatically. A database trigger does it, so every path (API, AI setup, rollover, imports,
-- seed, tests) behaves the same with no app change.
--
-- Rollback: drop the two *_campus_id_academic_year_fkey constraints, the two triggers and the function, and
-- the two indexes. Backfilled cycles can stay (they describe years that classes already use).

-- 1. Create the missing cycle for a campus and year, never touching an existing one. The school comes from
--    the campus row, so a row with a wrong school_id cannot create a cycle in the wrong school.
CREATE FUNCTION ensure_academic_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.campus_id IS NOT NULL AND NEW.academic_year IS NOT NULL THEN
    INSERT INTO academic_cycles (id, school_id, campus_id, label, academic_year, status, created_at, updated_at)
    SELECT gen_random_uuid()::text, c.school_id, c.id,
           NEW.academic_year || '-' || lpad(((NEW.academic_year + 1) % 100)::text, 2, '0'),
           NEW.academic_year, 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM campuses c WHERE c.id = NEW.campus_id
    ON CONFLICT (campus_id, academic_year) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER classes_ensure_academic_cycle BEFORE INSERT OR UPDATE OF campus_id, academic_year ON classes
  FOR EACH ROW EXECUTE FUNCTION ensure_academic_cycle();
CREATE TRIGGER student_enrollments_ensure_academic_cycle BEFORE INSERT OR UPDATE OF campus_id, academic_year ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION ensure_academic_cycle();

-- 2. Backfill the years existing rows already use. A campus that had no cycle at all gets its latest such
--    year as ACTIVE (onboarding's invariant); everything else is DRAFT.
CREATE TEMP TABLE skai1887_campuses_without_cycle AS
  SELECT c.id FROM campuses c WHERE NOT EXISTS (SELECT 1 FROM academic_cycles ac WHERE ac.campus_id = c.id);

INSERT INTO academic_cycles (id, school_id, campus_id, label, academic_year, status, created_at, updated_at)
SELECT gen_random_uuid()::text, c.school_id, c.id,
       y.academic_year || '-' || lpad(((y.academic_year + 1) % 100)::text, 2, '0'),
       y.academic_year, 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT campus_id, academic_year FROM classes
      UNION SELECT campus_id, academic_year FROM student_enrollments) y
JOIN campuses c ON c.id = y.campus_id
ON CONFLICT (campus_id, academic_year) DO NOTHING;

UPDATE academic_cycles ac SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
WHERE ac.campus_id IN (SELECT id FROM skai1887_campuses_without_cycle)
  AND ac.academic_year = (SELECT max(academic_year) FROM academic_cycles WHERE campus_id = ac.campus_id);

DROP TABLE skai1887_campuses_without_cycle;

-- 3. Keys.
CREATE INDEX "classes_campus_id_academic_year_idx" ON "classes"("campus_id", "academic_year");
CREATE INDEX "student_enrollments_campus_id_academic_year_idx" ON "student_enrollments"("campus_id", "academic_year");
ALTER TABLE "classes" ADD CONSTRAINT "classes_campus_id_academic_year_fkey" FOREIGN KEY ("campus_id", "academic_year") REFERENCES "academic_cycles"("campus_id", "academic_year") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_campus_id_academic_year_fkey" FOREIGN KEY ("campus_id", "academic_year") REFERENCES "academic_cycles"("campus_id", "academic_year") ON DELETE NO ACTION ON UPDATE NO ACTION;
