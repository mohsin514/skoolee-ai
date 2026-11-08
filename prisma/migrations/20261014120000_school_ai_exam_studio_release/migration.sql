-- AI Exam Studio, slice 1: form sets, sealed releases and item exposure.
--
-- Purely additive. Both new assignment columns are nullable or defaulted, and
-- PostgreSQL 11+ stores a non-volatile column default in the catalogue, so
-- neither ALTER TABLE rewrites school_ai_exam_assignments. No existing column
-- is altered or dropped and no existing row is read or written.

-- AlterTable
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN "form_set_id" TEXT;
ALTER TABLE "school_ai_exam_assignments" ADD COLUMN "form_label" TEXT NOT NULL DEFAULT 'A';

-- CreateTable
CREATE TABLE "school_ai_exam_form_sets" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "brief_record_id" TEXT NOT NULL,
    "blueprint_hash" TEXT NOT NULL,
    "max_forms" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_exam_form_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exam_form_releases" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "form_set_id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "form_label" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "hash_scheme" INTEGER NOT NULL DEFAULT 1,
    "rehearsal_id" TEXT NOT NULL,
    "released_by_id" TEXT NOT NULL,
    "released_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exam_form_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ai_exposure_entries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "item_group_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "item_revision" INTEGER NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "form_set_id" TEXT,
    "form_label" TEXT NOT NULL,
    "cohort_ids" JSONB NOT NULL,
    "exam_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_exposure_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_form_sets_id_school_id_campus_id_key" ON "school_ai_exam_form_sets"("id", "school_id", "campus_id");

-- CreateIndex
CREATE INDEX "school_ai_exam_form_sets_scope_status_updated_at_idx" ON "school_ai_exam_form_sets"("school_id", "campus_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_form_releases_form_set_label_language_key" ON "school_ai_exam_form_releases"("form_set_id", "form_label", "language");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_exam_form_releases_paper_version_language_key" ON "school_ai_exam_form_releases"("paper_id", "paper_version", "language");

-- CreateIndex
CREATE INDEX "school_ai_exam_form_releases_scope_content_hash_idx" ON "school_ai_exam_form_releases"("school_id", "campus_id", "content_hash");

-- CreateIndex
-- Exposure lookup when an author adds an item: most recent sitting first.
CREATE INDEX "school_ai_exposure_entries_group_idx" ON "school_ai_exposure_entries"("school_id", "campus_id", "item_group_id", "exam_date" DESC);

-- CreateIndex
CREATE INDEX "school_ai_exposure_entries_paper_idx" ON "school_ai_exposure_entries"("school_id", "campus_id", "paper_id", "paper_version");

-- AddForeignKey
ALTER TABLE "school_ai_exam_form_sets" ADD CONSTRAINT "school_ai_exam_form_sets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_form_sets" ADD CONSTRAINT "school_ai_exam_form_sets_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_form_releases" ADD CONSTRAINT "school_ai_exam_form_releases_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exam_form_releases" ADD CONSTRAINT "school_ai_exam_form_releases_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Compound key pins school_id and campus_id so a release cannot join a form
-- set belonging to another tenant.
ALTER TABLE "school_ai_exam_form_releases" ADD CONSTRAINT "school_ai_exam_form_releases_form_set_scope_fkey" FOREIGN KEY ("form_set_id", "school_id", "campus_id") REFERENCES "school_ai_exam_form_sets"("id", "school_id", "campus_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exposure_entries" ADD CONSTRAINT "school_ai_exposure_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_exposure_entries" ADD CONSTRAINT "school_ai_exposure_entries_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, matching every other school_ai table.
ALTER TABLE "school_ai_exam_form_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_form_sets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_ai_exam_form_sets" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "school_ai_exam_form_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exam_form_releases" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_ai_exam_form_releases" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));

ALTER TABLE "school_ai_exposure_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_exposure_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_ai_exposure_entries" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));
