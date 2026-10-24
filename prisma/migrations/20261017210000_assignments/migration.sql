-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submission_mode" TEXT NOT NULL DEFAULT 'ONLINE',
    "allowed_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opens_local" TEXT,
    "due_local" TEXT,
    "late_policy" TEXT NOT NULL DEFAULT 'ACCEPT_FLAGGED',
    "resubmission" TEXT NOT NULL DEFAULT 'AFTER_RETURN',
    "rubric" JSONB NOT NULL DEFAULT '[]',
    "objectives" JSONB,
    "resource_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_ref" TEXT,
    "owner_id" TEXT NOT NULL,
    "current_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rubric_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "criteria" JSONB NOT NULL,
    "total_points" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_rubric_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "rubric_version" INTEGER NOT NULL,
    "audience" TEXT[],
    "submission_mode" TEXT NOT NULL,
    "allowed_types" TEXT[],
    "timezone" TEXT NOT NULL,
    "opens_at" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "due_local" TEXT NOT NULL,
    "late_policy" TEXT NOT NULL,
    "resubmission" TEXT NOT NULL,
    "objectives" JSONB,
    "resource_ids" TEXT[],
    "released_by_id" TEXT NOT NULL,
    "released_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_extensions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "due_local" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "granted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "draft_text" TEXT NOT NULL DEFAULT '',
    "draft_storage_key" TEXT,
    "draft_file_name" TEXT,
    "draft_content_type" TEXT,
    "draft_size_bytes" INTEGER,
    "draft_sha256" TEXT,
    "draft_uploaded_at" TIMESTAMP(3),
    "draft_saved_at" TIMESTAMP(3),
    "latest_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submission_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "assignment_version" INTEGER NOT NULL,
    "rubric_version" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "receipt_code" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "storage_key" TEXT,
    "file_name" TEXT,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "file_sha256" TEXT,
    "artifact_sha256" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3) NOT NULL,
    "effective_due_at" TIMESTAMP(3) NOT NULL,
    "late" BOOLEAN NOT NULL,
    "draft_saved_at" TIMESTAMP(3),
    "recorded_by_id" TEXT NOT NULL,

    CONSTRAINT "assignment_submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_feedback" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "submission_version_id" TEXT NOT NULL,
    "rubric_version" INTEGER NOT NULL,
    "criteria" JSONB NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "total_points" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "gradebook_transfer" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "marker_id" TEXT NOT NULL,
    "returned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignments_school_id_class_id_status_idx" ON "assignments"("school_id", "class_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_school_id_external_ref_key" ON "assignments"("school_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_rubric_versions_assignment_id_version_key" ON "assignment_rubric_versions"("assignment_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_versions_assignment_id_version_key" ON "assignment_versions"("assignment_id", "version");

-- CreateIndex
CREATE INDEX "assignment_extensions_school_id_assignment_id_student_id_idx" ON "assignment_extensions"("school_id", "assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "assignment_submissions_school_id_student_id_idx" ON "assignment_submissions"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_student_id_key" ON "assignment_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submission_versions_submission_id_version_key" ON "assignment_submission_versions"("submission_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submission_versions_submission_id_idempotency_ke_key" ON "assignment_submission_versions"("submission_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submission_versions_school_id_receipt_code_key" ON "assignment_submission_versions"("school_id", "receipt_code");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_feedback_submission_version_id_key" ON "assignment_feedback"("submission_version_id");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rubric_versions" ADD CONSTRAINT "assignment_rubric_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rubric_versions" ADD CONSTRAINT "assignment_rubric_versions_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_extensions" ADD CONSTRAINT "assignment_extensions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_extensions" ADD CONSTRAINT "assignment_extensions_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_submission_versions" ADD CONSTRAINT "assignment_submission_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submission_versions" ADD CONSTRAINT "assignment_submission_versions_submission_fkey" FOREIGN KEY ("submission_id") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_feedback" ADD CONSTRAINT "assignment_feedback_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_feedback" ADD CONSTRAINT "assignment_feedback_submission_version_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "assignment_submission_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- SKO-409 invariants.
ALTER TABLE "assignments" ADD CONSTRAINT "assignment_status" CHECK ("status" IN ('DRAFT', 'RELEASED', 'CLOSED'));
ALTER TABLE "assignments" ADD CONSTRAINT "assignment_submission_mode" CHECK ("submission_mode" IN ('ONLINE', 'PAPER', 'BOTH'));
ALTER TABLE "assignments" ADD CONSTRAINT "assignment_late_policy" CHECK ("late_policy" IN ('ACCEPT_FLAGGED', 'REFUSE'));
ALTER TABLE "assignments" ADD CONSTRAINT "assignment_resubmission" CHECK ("resubmission" IN ('NEVER', 'AFTER_RETURN'));
ALTER TABLE "assignments" ADD CONSTRAINT "assignment_released_version" CHECK ("status" = 'DRAFT' OR "current_version" IS NOT NULL);
-- External LMS identifiers stay namespaced, e.g. "classroom:12345".
ALTER TABLE "assignments" ADD CONSTRAINT "assignment_external_ref_namespaced" CHECK ("external_ref" IS NULL OR "external_ref" ~ '^[a-z][a-z0-9-]{1,30}:[^[:space:]]{1,120}$');
ALTER TABLE "assignment_rubric_versions" ADD CONSTRAINT "assignment_rubric_shape" CHECK (jsonb_typeof("criteria") = 'array' AND jsonb_array_length("criteria") BETWEEN 1 AND 20 AND "total_points" > 0 AND "version" > 0);
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_version_window" CHECK ("due_at" > "opens_at" AND "version" > 0 AND cardinality("audience") > 0);
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_version_policy" CHECK ("submission_mode" IN ('ONLINE', 'PAPER', 'BOTH') AND "late_policy" IN ('ACCEPT_FLAGGED', 'REFUSE') AND "resubmission" IN ('NEVER', 'AFTER_RETURN'));
ALTER TABLE "assignment_extensions" ADD CONSTRAINT "assignment_extension_reason" CHECK (length(btrim("reason")) > 0);
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submission_status" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'RETURNED', 'REOPENED'));
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submission_draft_file" CHECK ("draft_uploaded_at" IS NULL OR ("draft_storage_key" IS NOT NULL AND "draft_sha256" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "assignment_submission_versions" ADD CONSTRAINT "assignment_submission_version_receipt" CHECK (
  "version" > 0 AND "mode" IN ('ONLINE', 'PAPER') AND "artifact_sha256" ~ '^[0-9a-f]{64}$'
  AND ("storage_key" IS NULL) = ("file_sha256" IS NULL) AND ("file_sha256" IS NULL OR "file_sha256" ~ '^[0-9a-f]{64}$')
  AND (length("text") > 0 OR "storage_key" IS NOT NULL) AND length("idempotency_key") BETWEEN 8 AND 120);
ALTER TABLE "assignment_feedback" ADD CONSTRAINT "assignment_feedback_status" CHECK ("status" IN ('DRAFT', 'RETURNED'));
-- Formative feedback never writes the gradebook here: a transfer can only be requested, never applied.
ALTER TABLE "assignment_feedback" ADD CONSTRAINT "assignment_feedback_gradebook_unapplied" CHECK ("gradebook_transfer" IN ('NOT_REQUESTED', 'REQUESTED'));
ALTER TABLE "assignment_feedback" ADD CONSTRAINT "assignment_feedback_returned" CHECK ("status" <> 'RETURNED' OR ("returned_at" IS NOT NULL AND "total_points" IS NOT NULL));

-- Rows are only removed with their school; everything else is kept as history.
CREATE FUNCTION assignment_rows_kept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Assignment records are kept; close the assignment instead';
END $$;
CREATE TRIGGER assignments_kept BEFORE DELETE ON "assignments" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();
CREATE TRIGGER assignment_rubric_versions_kept BEFORE DELETE ON "assignment_rubric_versions" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();
CREATE TRIGGER assignment_versions_kept BEFORE DELETE ON "assignment_versions" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();
CREATE TRIGGER assignment_extensions_kept BEFORE DELETE ON "assignment_extensions" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();
CREATE TRIGGER assignment_submissions_kept BEFORE DELETE ON "assignment_submissions" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();
CREATE TRIGGER assignment_submission_versions_kept BEFORE DELETE ON "assignment_submission_versions" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();
CREATE TRIGGER assignment_feedback_kept BEFORE DELETE ON "assignment_feedback" FOR EACH ROW EXECUTE FUNCTION assignment_rows_kept();

-- Released versions, rubric versions, extensions and receipts never change after insert.
CREATE FUNCTION assignment_row_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; add a new version instead', TG_TABLE_NAME;
END $$;
CREATE TRIGGER assignment_rubric_versions_immutable BEFORE UPDATE ON "assignment_rubric_versions" FOR EACH ROW EXECUTE FUNCTION assignment_row_immutable();
CREATE TRIGGER assignment_versions_immutable BEFORE UPDATE ON "assignment_versions" FOR EACH ROW EXECUTE FUNCTION assignment_row_immutable();
CREATE TRIGGER assignment_extensions_immutable BEFORE UPDATE ON "assignment_extensions" FOR EACH ROW EXECUTE FUNCTION assignment_row_immutable();
CREATE TRIGGER assignment_submission_versions_immutable BEFORE UPDATE ON "assignment_submission_versions" FOR EACH ROW EXECUTE FUNCTION assignment_row_immutable();

-- A release must point at an existing rubric version of the same assignment.
CREATE FUNCTION assignment_version_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM assignment_rubric_versions r WHERE r.assignment_id = NEW.assignment_id AND r.version = NEW.rubric_version AND r.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'A release must reference a rubric version of the same assignment';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_version_consistent BEFORE INSERT ON "assignment_versions" FOR EACH ROW EXECUTE FUNCTION assignment_version_consistent();

-- A receipt belongs to its submission's assignment and learner, and to a release that exists.
CREATE FUNCTION assignment_submission_version_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.id = NEW.submission_id AND s.assignment_id = NEW.assignment_id AND s.student_id = NEW.student_id AND s.school_id = NEW.school_id)
    OR NOT EXISTS (SELECT 1 FROM assignment_versions v WHERE v.assignment_id = NEW.assignment_id AND v.version = NEW.assignment_version AND v.rubric_version = NEW.rubric_version) THEN
    RAISE EXCEPTION 'A submission version must match its submission and an existing release';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_submission_version_consistent BEFORE INSERT ON "assignment_submission_versions" FOR EACH ROW EXECUTE FUNCTION assignment_submission_version_consistent();

-- Feedback scores against the submission's own rubric version and is frozen once returned.
CREATE FUNCTION assignment_feedback_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'RETURNED' THEN
    RAISE EXCEPTION 'Returned feedback cannot be changed';
  END IF;
  IF NEW.submission_version_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.submission_version_id ELSE NEW.submission_version_id END)
    OR NOT EXISTS (SELECT 1 FROM assignment_submission_versions v WHERE v.id = NEW.submission_version_id AND v.rubric_version = NEW.rubric_version AND v.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Feedback must use the rubric version of its submission';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_feedback_guard BEFORE INSERT OR UPDATE ON "assignment_feedback" FOR EACH ROW EXECUTE FUNCTION assignment_feedback_guard();
