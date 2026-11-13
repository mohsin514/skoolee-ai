-- SKAI-1893 (DB-01 Phase 4a): a legacy parent account link goes to the guardian review queue.
--
-- Parent access uses only verified guardian_relationships rows. students.parent_user_id is a legacy link
-- that grants nothing; when it points at a parent account with no relationship, that parent sees no child
-- and no admin is told. The guardian-access migration (2026-10-08) queued legacy *contacts* only for students
-- without a parent account, so these links were never reviewed.
--
-- Decision (2026-11-13): queue them for admin review. Nothing here grants access: an admin approves through
-- the existing Add guardian flow (verified account email, permissions, preview), or dismisses the item.
--
-- Rollback: DROP TRIGGER students_queue_unlinked_parent ON students;
--           DROP FUNCTION queue_unlinked_parent_account();
--           DELETE FROM guardian_review_queue WHERE reason = 'LEGACY_PARENT_ACCOUNT_UNLINKED' AND status = 'OPEN';

-- Queue (or reopen) the review item for one student when its parent account has no relationship. The parent
-- must be a PARENT user of the same school; anything else is not a guardian and is left alone.
CREATE FUNCTION queue_unlinked_parent_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_user_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.parent_user_id IS NOT DISTINCT FROM OLD.parent_user_id)
     OR EXISTS (SELECT 1 FROM guardian_relationships g
                WHERE g.student_id = NEW.id AND g.guardian_user_id = NEW.parent_user_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO guardian_review_queue (id, school_id, campus_id, student_id, contact_name, email, phone, legacy_relationship, reason)
  SELECT gen_random_uuid()::text, NEW.school_id, NEW.campus_id, NEW.id, u.full_name, u.email, u.phone,
         NEW.guardian_relationship, 'LEGACY_PARENT_ACCOUNT_UNLINKED'
  FROM users u
  WHERE u.id = NEW.parent_user_id AND u.school_id = NEW.school_id AND u.role = 'PARENT'
  ON CONFLICT (student_id, reason) DO UPDATE
    SET status = 'OPEN', contact_name = EXCLUDED.contact_name, email = EXCLUDED.email, phone = EXCLUDED.phone,
        legacy_relationship = EXCLUDED.legacy_relationship, reviewed_by_user_id = NULL, reviewed_at = NULL,
        created_at = CURRENT_TIMESTAMP;
  RETURN NULL;
END $$;

CREATE TRIGGER students_queue_unlinked_parent AFTER INSERT OR UPDATE OF parent_user_id ON students
  FOR EACH ROW EXECUTE FUNCTION queue_unlinked_parent_account();

-- Backfill the links that exist today (dev: 9). An item already queued for the student is left as it is.
INSERT INTO guardian_review_queue (id, school_id, campus_id, student_id, contact_name, email, phone, legacy_relationship, reason)
SELECT gen_random_uuid()::text, s.school_id, s.campus_id, s.id, u.full_name, u.email, u.phone,
       s.guardian_relationship, 'LEGACY_PARENT_ACCOUNT_UNLINKED'
FROM students s
JOIN users u ON u.id = s.parent_user_id AND u.school_id = s.school_id AND u.role = 'PARENT'
WHERE NOT EXISTS (SELECT 1 FROM guardian_relationships g WHERE g.student_id = s.id AND g.guardian_user_id = s.parent_user_id)
ON CONFLICT (student_id, reason) DO NOTHING;
