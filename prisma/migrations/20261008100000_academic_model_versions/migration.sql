-- Versioned curriculum, reporting periods, and grading rules.
CREATE TABLE "academic_model_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "academic_year" INTEGER NOT NULL,
    "cohort_key" TEXT NOT NULL,
    "cohort_label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "configuration" JSONB NOT NULL,
    "template_source_id" TEXT,
    "inherited_configuration" JSONB,
    "delegated_override_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "local_override_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_shared_template" BOOLEAN NOT NULL DEFAULT false,
    "template_approved_at" TIMESTAMP(3),
    "template_approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_model_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academic_model_versions_campus_id_academic_year_cohort_key__key"
    ON "academic_model_versions"("campus_id", "academic_year", "cohort_key", "version");
CREATE INDEX "academic_model_versions_school_id_campus_id_academic_year_s_idx"
    ON "academic_model_versions"("school_id", "campus_id", "academic_year", "status");
CREATE INDEX "academic_model_versions_template_source_id_idx"
    ON "academic_model_versions"("template_source_id");

ALTER TABLE "academic_model_versions" ADD CONSTRAINT "academic_model_versions_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_model_versions" ADD CONSTRAINT "academic_model_versions_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exams" ADD COLUMN "academic_model_version_id" TEXT;
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_model_version_id_fkey"
    FOREIGN KEY ("academic_model_version_id") REFERENCES "academic_model_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "grade_weight_configs"
    ADD COLUMN "missing_mark_policy" TEXT NOT NULL DEFAULT 'COUNT_AS_ZERO',
    ADD COLUMN "absent_mark_policy" TEXT NOT NULL DEFAULT 'COUNT_AS_ZERO',
    ADD COLUMN "exempt_mark_policy" TEXT NOT NULL DEFAULT 'EXCLUDE',
    ADD COLUMN "rounding_rule" TEXT NOT NULL DEFAULT 'WHOLE',
    ADD COLUMN "academic_model_version_id" TEXT;
ALTER TABLE "grade_weight_configs" ADD CONSTRAINT "grade_weight_configs_academic_model_version_id_fkey"
    FOREIGN KEY ("academic_model_version_id") REFERENCES "academic_model_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marks" ADD COLUMN "is_exempt" BOOLEAN NOT NULL DEFAULT false;
