-- CreateTable
CREATE TABLE "school_ai_document_jobs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "record_id" TEXT NOT NULL,
    "record_version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "access_version" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error_code" TEXT,
    "applied_version" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_ai_document_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_document_jobs_status_scheduled_at_id_idx" ON "school_ai_document_jobs"("status", "scheduled_at", "id");

-- CreateIndex
CREATE INDEX "school_ai_document_jobs_school_id_campus_id_record_id_idx" ON "school_ai_document_jobs"("school_id", "campus_id", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_document_jobs_record_id_record_version_kind_key" ON "school_ai_document_jobs"("record_id", "record_version", "kind");

-- AddForeignKey
ALTER TABLE "school_ai_document_jobs" ADD CONSTRAINT "school_ai_document_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_document_jobs" ADD CONSTRAINT "school_ai_document_jobs_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_document_jobs" ADD CONSTRAINT "school_ai_document_jobs_record_id_school_id_fkey" FOREIGN KEY ("record_id", "school_id") REFERENCES "school_ai_records"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE school_ai_document_jobs ADD CONSTRAINT school_ai_document_jobs_kind_check CHECK (kind IN ('EXTRACT','DELETE_ORIGINAL'));
ALTER TABLE school_ai_document_jobs ADD CONSTRAINT school_ai_document_jobs_status_check CHECK (status IN ('QUEUED','PROCESSING','READY','APPLIED','COMPLETED','CANCELLED','FAILED'));
ALTER TABLE school_ai_document_jobs ADD CONSTRAINT school_ai_document_jobs_values_check CHECK (version > 0 AND record_version > 0 AND attempts BETWEEN 0 AND 3);
ALTER TABLE school_ai_document_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_ai_document_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_ai_document_jobs USING (school_id = NULLIF(current_setting('app.current_school_id', true),'')) WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true),''));

ALTER TABLE school_ai_substitute_duties ADD COLUMN lesson_snapshot JSONB NOT NULL DEFAULT '{}';
