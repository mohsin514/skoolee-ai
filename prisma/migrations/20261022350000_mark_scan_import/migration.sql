-- SKO-412: printable marks sheets, scan batches, staged cells and reviewed import.
-- CreateTable
CREATE TABLE "mark_sheet_templates" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "rows_per_page" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "max_marks" INTEGER NOT NULL,
    "roster" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mark_sheet_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_scan_batches" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "baseline" JSONB NOT NULL DEFAULT '{}',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),
    "commit_key" TEXT,
    "receipt" JSONB,
    "reversed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mark_scan_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_scan_pages" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "batch_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sharpness" DOUBLE PRECISION NOT NULL,
    "contrast" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mark_scan_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_scan_cells" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "batch_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "student_id" TEXT NOT NULL,
    "proposed_value" DOUBLE PRECISION,
    "proposed_absent" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "reviewed_value" DOUBLE PRECISION,
    "reviewed_absent" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "corrected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "mark_scan_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mark_sheet_templates_reference_key" ON "mark_sheet_templates"("reference");

-- CreateIndex
CREATE INDEX "mark_sheet_templates_school_id_idx" ON "mark_sheet_templates"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "mark_sheet_templates_exam_id_subject_id_version_key" ON "mark_sheet_templates"("exam_id", "subject_id", "version");

-- CreateIndex
CREATE INDEX "mark_scan_batches_template_id_status_idx" ON "mark_scan_batches"("template_id", "status");

-- CreateIndex
CREATE INDEX "mark_scan_batches_school_id_idx" ON "mark_scan_batches"("school_id");

-- CreateIndex
CREATE INDEX "mark_scan_pages_batch_id_page_number_idx" ON "mark_scan_pages"("batch_id", "page_number");

-- CreateIndex
CREATE INDEX "mark_scan_pages_school_id_idx" ON "mark_scan_pages"("school_id");

-- CreateIndex
CREATE INDEX "mark_scan_cells_school_id_idx" ON "mark_scan_cells"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "mark_scan_cells_batch_id_student_id_key" ON "mark_scan_cells"("batch_id", "student_id");

-- AddForeignKey
ALTER TABLE "mark_sheet_templates" ADD CONSTRAINT "mark_sheet_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_scan_batches" ADD CONSTRAINT "mark_scan_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_scan_batches" ADD CONSTRAINT "mark_scan_batches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "mark_sheet_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_scan_pages" ADD CONSTRAINT "mark_scan_pages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_scan_pages" ADD CONSTRAINT "mark_scan_pages_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "mark_scan_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_scan_cells" ADD CONSTRAINT "mark_scan_cells_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_scan_cells" ADD CONSTRAINT "mark_scan_cells_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "mark_scan_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "mark_scan_batches" ADD CONSTRAINT "mark_scan_batches_status_check" CHECK (status IN ('CAPTURING', 'REVIEW', 'APPROVED', 'COMMITTED', 'REVERSED', 'CANCELLED') AND (status NOT IN ('APPROVED', 'COMMITTED', 'REVERSED') OR approved_by_id IS NOT NULL));
ALTER TABLE "mark_scan_pages" ADD CONSTRAINT "mark_scan_pages_status_check" CHECK (status IN ('ACCEPTED', 'RETAKE', 'REPLACED') AND sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE "mark_scan_cells" ADD CONSTRAINT "mark_scan_cells_status_check" CHECK (status IN ('NEEDS_REVIEW', 'REVIEWED', 'EXCLUDED') AND (status <> 'REVIEWED' OR reviewed_by_id IS NOT NULL) AND (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)));
CREATE UNIQUE INDEX "mark_scan_pages_one_accepted" ON "mark_scan_pages" ("batch_id", "page_number") WHERE status = 'ACCEPTED';
CREATE UNIQUE INDEX "mark_scan_batches_commit_key" ON "mark_scan_batches" ("commit_key") WHERE commit_key IS NOT NULL;
