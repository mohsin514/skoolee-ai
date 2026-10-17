-- SKO-398: versioned admission forms, applications with submission snapshots, events, documents and a one-time conversion to a pupil.
-- CreateTable
CREATE TABLE "admission_forms" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "public_token" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_form_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "channel" TEXT NOT NULL DEFAULT 'FAMILY',
    "answers" JSONB NOT NULL,
    "child_name" TEXT NOT NULL DEFAULT '',
    "date_of_birth" DATE,
    "guardian_phone" TEXT,
    "identity_keys" TEXT[],
    "resume_key_hash" TEXT,
    "enquiry_id" TEXT,
    "owner_id" TEXT,
    "next_contact_at" TIMESTAMP(3),
    "intake_class_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "consent_at" TIMESTAMP(3),
    "consent_text" TEXT,
    "converted_student_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "converted_by_id" TEXT,
    "duplicate_decision" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_submissions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "application_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "document_ids" TEXT[],
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by" TEXT NOT NULL,

    CONSTRAINT "admission_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_application_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "application_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "office_note" TEXT,
    "family_message" TEXT,
    "detail" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_documents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "application_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_forms_public_token_key" ON "admission_forms"("public_token");

-- CreateIndex
CREATE INDEX "admission_forms_campus_id_idx" ON "admission_forms"("campus_id");

-- CreateIndex
CREATE INDEX "admission_forms_school_id_idx" ON "admission_forms"("school_id");

-- CreateIndex
CREATE INDEX "admission_form_versions_school_id_idx" ON "admission_form_versions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_form_versions_form_id_version_key" ON "admission_form_versions"("form_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_converted_student_id_key" ON "admission_applications"("converted_student_id");

-- CreateIndex
CREATE INDEX "admission_applications_campus_id_status_idx" ON "admission_applications"("campus_id", "status");

-- CreateIndex
CREATE INDEX "admission_applications_school_id_idx" ON "admission_applications"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_school_id_reference_key" ON "admission_applications"("school_id", "reference");

-- CreateIndex
CREATE INDEX "admission_submissions_application_id_submitted_at_idx" ON "admission_submissions"("application_id", "submitted_at");

-- CreateIndex
CREATE INDEX "admission_submissions_school_id_idx" ON "admission_submissions"("school_id");

-- CreateIndex
CREATE INDEX "admission_application_events_application_id_created_at_idx" ON "admission_application_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "admission_application_events_school_id_idx" ON "admission_application_events"("school_id");

-- CreateIndex
CREATE INDEX "admission_documents_application_id_key_idx" ON "admission_documents"("application_id", "key");

-- CreateIndex
CREATE INDEX "admission_documents_school_id_idx" ON "admission_documents"("school_id");

-- AddForeignKey
ALTER TABLE "admission_forms" ADD CONSTRAINT "admission_forms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_form_versions" ADD CONSTRAINT "admission_form_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_form_versions" ADD CONSTRAINT "admission_form_versions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "admission_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "admission_form_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "admission_queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_submissions" ADD CONSTRAINT "admission_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_submissions" ADD CONSTRAINT "admission_submissions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_submissions" ADD CONSTRAINT "admission_submissions_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "admission_form_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_events" ADD CONSTRAINT "admission_application_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_application_events" ADD CONSTRAINT "admission_application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_status_check" CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','INFO_REQUESTED','OFFERED','WAITLISTED','ACCEPTED','DECLINED','REJECTED','WITHDRAWN','ENROLLED'));
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_enrolled_check" CHECK (status <> 'ENROLLED' OR (converted_student_id IS NOT NULL AND converted_at IS NOT NULL));
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_channel_check" CHECK (channel IN ('FAMILY','STAFF'));
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_size_check" CHECK (size_bytes > 0 AND size_bytes <= 5242880);
-- A published form version and a submission are records of what was asked and answered; neither changes.
CREATE OR REPLACE FUNCTION admission_record_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Published admission forms and submitted applications are kept as sent';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER admission_form_version_frozen BEFORE UPDATE ON "admission_form_versions" FOR EACH ROW EXECUTE FUNCTION admission_record_frozen();
CREATE TRIGGER admission_submission_frozen BEFORE UPDATE ON "admission_submissions" FOR EACH ROW EXECUTE FUNCTION admission_record_frozen();
