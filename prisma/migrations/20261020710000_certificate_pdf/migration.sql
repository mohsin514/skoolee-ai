-- SKO-469: keep the delivered PDF bytes of each issued document; they are written once and never replaced.
-- AlterTable
ALTER TABLE "certificate_issues" ADD COLUMN     "pdf" BYTEA,
ADD COLUMN     "pdf_sha256" TEXT;


CREATE OR REPLACE FUNCTION certificate_issue_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL AND (NEW.rendered_body IS DISTINCT FROM OLD.rendered_body OR NEW.title IS DISTINCT FROM OLD.title OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash OR NEW.serial IS DISTINCT FROM OLD.serial OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id OR NEW.photo_url IS DISTINCT FROM OLD.photo_url) THEN
    RAISE EXCEPTION 'An issued certificate cannot be changed; reissue it instead';
  END IF;
  IF OLD.pdf IS NOT NULL AND (NEW.pdf IS DISTINCT FROM OLD.pdf OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256) THEN
    RAISE EXCEPTION 'A delivered certificate PDF cannot be replaced';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
