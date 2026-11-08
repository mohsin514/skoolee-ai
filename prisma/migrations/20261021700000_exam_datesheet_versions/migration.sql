-- SKO-413: published, versioned exam datesheets.
CREATE TABLE "exam_datesheet_versions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "seating_hash" TEXT NOT NULL,
    "changes" JSONB,
    "affected" JSONB,
    "reason" TEXT,
    "published_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_datesheet_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "exam_datesheet_versions_session_id_version_key" ON "exam_datesheet_versions"("session_id", "version");
CREATE INDEX "exam_datesheet_versions_school_id_idx" ON "exam_datesheet_versions"("school_id");
