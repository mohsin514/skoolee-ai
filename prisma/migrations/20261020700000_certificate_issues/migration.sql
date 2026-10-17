-- SKO-469: approved, immutable template versions and issued documents with frozen content, serial, artifact hash, verification token, approval, revocation and reissue chain.
-- AlterTable
ALTER TABLE "certificate_templates" ADD COLUMN     "current_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "draft_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "requires_approval" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "certificate_template_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "page_size" TEXT NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_issues" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version_id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "snapshot" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "rendered_body" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "page_size" TEXT NOT NULL,
    "photo_url" TEXT,
    "artifact_hash" TEXT NOT NULL,
    "verify_token" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "previous_id" TEXT,
    "reissue_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT,
    "request_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_template_versions_school_id_idx" ON "certificate_template_versions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_template_versions_template_id_version_key" ON "certificate_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "certificate_issues_campus_id_status_idx" ON "certificate_issues"("campus_id", "status");

-- CreateIndex
CREATE INDEX "certificate_issues_student_id_idx" ON "certificate_issues"("student_id");

-- CreateIndex
CREATE INDEX "certificate_issues_school_id_idx" ON "certificate_issues"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_issues_school_id_serial_key" ON "certificate_issues"("school_id", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_issues_verify_token_key" ON "certificate_issues"("verify_token");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_issues_campus_id_idempotency_key_key" ON "certificate_issues"("campus_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "certificate_template_versions" ADD CONSTRAINT "certificate_template_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_template_versions" ADD CONSTRAINT "certificate_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "certificate_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_previous_id_fkey" FOREIGN KEY ("previous_id") REFERENCES "certificate_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing templates keep their text as a draft; none is approved until a campus leader reviews it.
UPDATE "certificate_templates" SET requires_approval = true;
UPDATE "certificate_templates" SET kind = 'STUDENT_CERTIFICATE' WHERE kind NOT IN ('STUDENT_CERTIFICATE', 'ID_CARD');
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_kind_check" CHECK (kind IN ('STUDENT_CERTIFICATE', 'ID_CARD'));
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_language_check" CHECK (language IN ('en', 'ar', 'ur'));
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_status_check" CHECK (status IN ('PENDING_APPROVAL', 'ISSUED', 'REJECTED', 'REVOKED', 'SUPERSEDED'));
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_issued_check" CHECK (status IN ('PENDING_APPROVAL', 'REJECTED') OR (issued_at IS NOT NULL AND approved_by_id IS NOT NULL));
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_revoked_check" CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND decision_note IS NOT NULL));
-- A reissue must name why; nobody may rewrite what was issued (enforced in the service, and here for the content).
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_reissue_check" CHECK (previous_id IS NULL OR reissue_reason IS NOT NULL);
CREATE OR REPLACE FUNCTION certificate_issue_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL AND (NEW.rendered_body IS DISTINCT FROM OLD.rendered_body OR NEW.title IS DISTINCT FROM OLD.title OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash OR NEW.serial IS DISTINCT FROM OLD.serial OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id OR NEW.photo_url IS DISTINCT FROM OLD.photo_url) THEN
    RAISE EXCEPTION 'An issued certificate cannot be changed; reissue it instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER certificate_issue_frozen BEFORE UPDATE ON "certificate_issues" FOR EACH ROW EXECUTE FUNCTION certificate_issue_frozen();
