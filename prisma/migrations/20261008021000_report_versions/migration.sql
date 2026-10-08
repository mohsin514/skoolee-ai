-- AlterTable
ALTER TABLE "report_cards" ADD COLUMN     "current_version_id" TEXT,
ADD COLUMN     "published_version_id" TEXT,
ADD COLUMN     "remarks_ar" TEXT,
ADD COLUMN     "report_language" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "report_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "report_card_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "document_identity" TEXT NOT NULL,
    "document_bytes" BYTEA,
    "language" TEXT NOT NULL DEFAULT 'en',
    "snapshot" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "changed_sections" JSONB NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "predecessor_id" TEXT,
    "correction_reason" TEXT,
    "reviewer_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_document_identity_key" ON "report_versions"("document_identity");

-- CreateIndex
CREATE INDEX "report_versions_school_id_idx" ON "report_versions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_report_card_id_number_key" ON "report_versions"("report_card_id", "number");

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "report_cards_id_school_id_key" ON "report_cards"("id", "school_id");
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_card_id_school_id_fkey" FOREIGN KEY ("report_card_id", "school_id") REFERENCES "report_cards"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE report_versions ADD CONSTRAINT report_version_approval_artifact CHECK (approved_at IS NULL OR (approved_by IS NOT NULL AND document_bytes IS NOT NULL));
ALTER TABLE report_versions ADD CONSTRAINT report_version_publication_approval CHECK (published_at IS NULL OR approved_at IS NOT NULL);
ALTER TABLE report_versions ADD CONSTRAINT report_version_language CHECK (language IN ('en','ar','ur'));
ALTER TABLE report_cards ADD CONSTRAINT report_card_language CHECK (report_language IN ('en','ar','ur'));

-- Revisions invalidate even change-then-revert sequences. Published snapshots remain immutable.
ALTER TABLE report_cards ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION report_material_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.remarks_en,NEW.remarks_ur,NEW.remarks_ar,NEW.report_language,NEW.total_marks,NEW.obtained_marks,NEW.percentage,NEW.grade,NEW.rank,NEW.attendance_present,NEW.attendance_total)
 IS DISTINCT FROM ROW(OLD.remarks_en,OLD.remarks_ur,OLD.remarks_ar,OLD.report_language,OLD.total_marks,OLD.obtained_marks,OLD.percentage,OLD.grade,OLD.rank,OLD.attendance_present,OLD.attendance_total) THEN
  NEW.source_revision := OLD.source_revision + 1;
  NEW.remarks_approved := false; NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.pdf_url := NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_material_edit BEFORE UPDATE ON report_cards FOR EACH ROW EXECUTE FUNCTION report_material_edit();
CREATE FUNCTION report_source_edit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE olddata jsonb; newdata jsonb; sid text; cid text;
BEGIN
 olddata := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 newdata := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' AND olddata=newdata THEN RETURN NEW; END IF;
 sid := CASE WHEN TG_TABLE_NAME='schools' THEN COALESCE(newdata->>'id',olddata->>'id') ELSE COALESCE(newdata->>'school_id',olddata->>'school_id') END;
 -- Conservative invalidation also includes other weighted exams and identity changes.
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
CREATE TRIGGER report_marks_edit AFTER INSERT OR UPDATE OR DELETE ON marks FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE TRIGGER report_grading_edit AFTER INSERT OR UPDATE OR DELETE ON grade_weight_configs FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE TRIGGER report_subject_edit AFTER UPDATE OR DELETE ON subjects FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE TRIGGER report_student_edit AFTER UPDATE OF full_name,roll_no ON students FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE TRIGGER report_campus_edit AFTER UPDATE OF name,city,address,phone,email,website,principal_name,board,logo_url ON campuses FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE TRIGGER report_school_edit AFTER UPDATE OF name,logo_url,phone,website,tagline,contact_email,established_year ON schools FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE TRIGGER report_class_edit AFTER UPDATE OF name,section,academic_year ON classes FOR EACH ROW EXECUTE FUNCTION report_source_edit();
CREATE FUNCTION report_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.snapshot,NEW.content_hash,NEW.document_identity,NEW.number,NEW.report_card_id,NEW.school_id,NEW.language,NEW.blockers,NEW.changed_sections)
 IS DISTINCT FROM ROW(OLD.snapshot,OLD.content_hash,OLD.document_identity,OLD.number,OLD.report_card_id,OLD.school_id,OLD.language,OLD.blockers,OLD.changed_sections)
 OR (OLD.approved_at IS NOT NULL AND (NEW.document_bytes IS DISTINCT FROM OLD.document_bytes OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason))
 OR (OLD.published_at IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
  RAISE EXCEPTION 'Report version content is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_version_immutable BEFORE UPDATE ON report_versions FOR EACH ROW EXECUTE FUNCTION report_version_immutable();
