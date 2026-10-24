-- CreateTable
CREATE TABLE "data_retention_schedules" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_retention_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_legal_holds" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "record_id" TEXT,
    "reason" TEXT NOT NULL,
    "placed_by" TEXT NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by" TEXT,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,

    CONSTRAINT "data_legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_lifecycle_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "category" TEXT,
    "student_id" TEXT,
    "target_region" TEXT,
    "reason" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "plan" JSONB,
    "receipt" JSONB,
    "artifact" JSONB,
    "download_token" TEXT,
    "download_expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "data_lifecycle_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_service_verifications" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "verified_by" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_service_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_schedules_school_id_category_version_key" ON "data_retention_schedules"("school_id", "category", "version");

-- CreateIndex
CREATE INDEX "data_legal_holds_school_id_category_released_at_idx" ON "data_legal_holds"("school_id", "category", "released_at");

-- CreateIndex
CREATE UNIQUE INDEX "data_lifecycle_requests_download_token_key" ON "data_lifecycle_requests"("download_token");

-- CreateIndex
CREATE INDEX "data_lifecycle_requests_school_id_status_requested_at_idx" ON "data_lifecycle_requests"("school_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "data_service_verifications_service_region_expires_at_idx" ON "data_service_verifications"("service", "region", "expires_at");

-- AddForeignKey
ALTER TABLE "data_retention_schedules" ADD CONSTRAINT "data_retention_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_legal_holds" ADD CONSTRAINT "data_legal_holds_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_lifecycle_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lifecycle evidence invariants (SKO-447).
ALTER TABLE "data_retention_schedules" ADD CONSTRAINT "data_retention_days_positive" CHECK ("retention_days" BETWEEN 1 AND 36500);
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_request_kind" CHECK ("kind" IN ('EXPORT', 'RETENTION_DELETION', 'MIGRATION'));
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_request_status" CHECK ("status" IN ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED', 'BLOCKED'));
ALTER TABLE "data_lifecycle_requests" ADD CONSTRAINT "data_request_reviewer_separate" CHECK ("reviewed_by" IS NULL OR "reviewed_by" <> "requested_by");

CREATE FUNCTION data_retention_schedule_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Retention schedules are versioned; add a new version instead';
END $$;
CREATE TRIGGER data_retention_schedule_append_only BEFORE UPDATE OR DELETE ON "data_retention_schedules"
  FOR EACH ROW EXECUTE FUNCTION data_retention_schedule_append_only();

CREATE FUNCTION data_legal_hold_release_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Legal holds are released, not deleted'; END IF;
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NEW.released_by IS NULL OR coalesce(NEW.release_reason, '') = ''
    OR (to_jsonb(NEW) - ARRAY['released_by', 'released_at', 'release_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['released_by', 'released_at', 'release_reason']) THEN
    RAISE EXCEPTION 'A legal hold can only be released once, with a reason';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER data_legal_hold_release_only BEFORE UPDATE OR DELETE ON "data_legal_holds"
  FOR EACH ROW EXECUTE FUNCTION data_legal_hold_release_only();
