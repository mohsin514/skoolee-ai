-- SKAI-2003: a never-released DRAFT assignment may be discarded. Released or closed
-- assignments and every child row stay kept as before. This only relaxes the guard,
-- so it is backwards-compatible with the previous release.
CREATE OR REPLACE FUNCTION assignment_rows_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'assignments' AND OLD.status = 'DRAFT' AND OLD.current_version IS NULL THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Assignment records are kept; close the assignment instead';
END $$;
