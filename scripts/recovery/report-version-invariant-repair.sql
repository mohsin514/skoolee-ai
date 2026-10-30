-- SKO-375 / report-version invariants repair for the ledgerless local instance.
--
-- `prisma db push` (npm run db:sync / db:reset) creates the Prisma schema but
-- cannot create Postgres triggers, so the report invalidation and immutability
-- guarantees declared in
--   prisma/migrations/20261008021000_report_versions/migration.sql
-- are absent after a schema-only provision. The 127.0.0.1:55438 fixture has no
-- Prisma migration ledger, so the additive SQL from that migration must be
-- applied directly (same pattern as the School AI exam-integrity migration).
--
-- This script is idempotent: it replaces the functions and triggers with the
-- exact definitions from the migration and can be re-run safely.
--
-- Apply:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/recovery/report-version-invariant-repair.sql

DO $guard$
BEGIN
  IF to_regclass('public.report_cards') IS NULL OR to_regclass('public.report_versions') IS NULL THEN
    RAISE EXCEPTION 'report_cards/report_versions are missing; run prisma db push before this repair';
  END IF;
END
$guard$;

-- Revision invalidation: any material edit to an approved report card withdraws
-- its approval and bumps source_revision, even for change-then-revert sequences.
CREATE OR REPLACE FUNCTION report_material_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.remarks_en,NEW.remarks_ur,NEW.remarks_ar,NEW.report_language,NEW.locale_snapshot,NEW.total_marks,NEW.obtained_marks,NEW.percentage,NEW.grade,NEW.rank,NEW.attendance_present,NEW.attendance_total)
 IS DISTINCT FROM ROW(OLD.remarks_en,OLD.remarks_ur,OLD.remarks_ar,OLD.report_language,OLD.locale_snapshot,OLD.total_marks,OLD.obtained_marks,OLD.percentage,OLD.grade,OLD.rank,OLD.attendance_present,OLD.attendance_total) THEN
  NEW.source_revision := OLD.source_revision + 1;
  NEW.remarks_approved := false; NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.pdf_url := NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_material_edit ON report_cards;
CREATE TRIGGER report_material_edit BEFORE UPDATE ON report_cards FOR EACH ROW EXECUTE FUNCTION report_material_edit();

-- Upstream source invalidation: marks, grading rules, subject/identity/campus
-- changes withdraw approval of every affected report card.
CREATE OR REPLACE FUNCTION report_source_edit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE olddata jsonb; newdata jsonb; sid text; cid text;
BEGIN
 olddata := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 newdata := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' AND olddata=newdata THEN RETURN NEW; END IF;
 sid := CASE WHEN TG_TABLE_NAME='schools' THEN COALESCE(newdata->>'id',olddata->>'id') ELSE COALESCE(newdata->>'school_id',olddata->>'school_id') END;
 UPDATE report_cards SET source_revision=source_revision+1,remarks_approved=false,approved_by=NULL,approved_at=NULL,pdf_url=NULL
 WHERE school_id=sid AND (
   (TG_TABLE_NAME='marks' AND student_id=COALESCE(newdata->>'student_id',olddata->>'student_id')) OR
   (TG_TABLE_NAME IN ('grade_weight_configs','subjects') AND exam_id IN (SELECT id FROM exams WHERE class_id=COALESCE(newdata->>'class_id',olddata->>'class_id'))) OR
   (TG_TABLE_NAME='students' AND student_id=COALESCE(newdata->>'id',olddata->>'id')) OR
   (TG_TABLE_NAME='campuses' AND campus_id=COALESCE(newdata->>'id',olddata->>'id')) OR
   (TG_TABLE_NAME='schools') OR
   (TG_TABLE_NAME='classes' AND exam_id IN (SELECT id FROM exams WHERE class_id=COALESCE(newdata->>'id',olddata->>'id')))
 );
 RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS report_marks_edit ON marks;
CREATE TRIGGER report_marks_edit AFTER INSERT OR UPDATE OR DELETE ON marks FOR EACH ROW EXECUTE FUNCTION report_source_edit();
DROP TRIGGER IF EXISTS report_grading_edit ON grade_weight_configs;
CREATE TRIGGER report_grading_edit AFTER INSERT OR UPDATE OR DELETE ON grade_weight_configs FOR EACH ROW EXECUTE FUNCTION report_source_edit();
DROP TRIGGER IF EXISTS report_subject_edit ON subjects;
CREATE TRIGGER report_subject_edit AFTER UPDATE OR DELETE ON subjects FOR EACH ROW EXECUTE FUNCTION report_source_edit();
-- Roll number belongs to the enrollment snapshot; only the displayed name may
-- invalidate a published report from a previous period.
DROP TRIGGER IF EXISTS report_student_edit ON students;
CREATE TRIGGER report_student_edit AFTER UPDATE OF full_name ON students FOR EACH ROW EXECUTE FUNCTION report_source_edit();
DROP TRIGGER IF EXISTS report_campus_edit ON campuses;
CREATE TRIGGER report_campus_edit AFTER UPDATE OF name,city,address,phone,email,website,principal_name,board,logo_url ON campuses FOR EACH ROW EXECUTE FUNCTION report_source_edit();
DROP TRIGGER IF EXISTS report_school_edit ON schools;
CREATE TRIGGER report_school_edit AFTER UPDATE OF name,logo_url,phone,website,tagline,contact_email,established_year ON schools FOR EACH ROW EXECUTE FUNCTION report_source_edit();
DROP TRIGGER IF EXISTS report_class_edit ON classes;
CREATE TRIGGER report_class_edit AFTER UPDATE OF name,section,academic_year ON classes FOR EACH ROW EXECUTE FUNCTION report_source_edit();

-- Published/released snapshots are immutable.
CREATE OR REPLACE FUNCTION report_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.snapshot,NEW.content_hash,NEW.document_identity,NEW.number,NEW.report_card_id,NEW.school_id,NEW.language,NEW.blockers,NEW.changed_sections)
 IS DISTINCT FROM ROW(OLD.snapshot,OLD.content_hash,OLD.document_identity,OLD.number,OLD.report_card_id,OLD.school_id,OLD.language,OLD.blockers,OLD.changed_sections)
 OR (OLD.approved_at IS NOT NULL AND (NEW.document_bytes IS DISTINCT FROM OLD.document_bytes OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason))
 OR (OLD.published_at IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
  RAISE EXCEPTION 'Report version content is immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_version_immutable ON report_versions;
CREATE TRIGGER report_version_immutable BEFORE UPDATE ON report_versions FOR EACH ROW EXECUTE FUNCTION report_version_immutable();
