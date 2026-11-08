ALTER TABLE "school_ai_exam_assignments" ADD COLUMN "proctor_policy" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "school_ai_proctor_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "school_id" TEXT NOT NULL DEFAULT '',
  "campus_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "client_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "consent_version" TEXT NOT NULL,
  "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retention_until" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),
  "bytes" INTEGER NOT NULL DEFAULT 0 CHECK ("bytes" >= 0),
  "clip_count" INTEGER NOT NULL DEFAULT 0 CHECK ("clip_count" >= 0),
  "review_note" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  CONSTRAINT "school_ai_proctor_sessions_assignment_id_school_id_campus_id_fkey" FOREIGN KEY ("assignment_id","school_id","campus_id") REFERENCES "school_ai_exam_assignments"("id","school_id","campus_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_ai_proctor_sessions_attempt_id_school_id_campus_id_fkey" FOREIGN KEY ("attempt_id","school_id","campus_id") REFERENCES "school_ai_exam_attempts"("id","school_id","campus_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "school_ai_proctor_sessions_attempt_id_kind_client_key_key" ON "school_ai_proctor_sessions"("attempt_id","kind","client_key");
CREATE UNIQUE INDEX "school_ai_proctor_sessions_id_school_id_campus_id_key" ON "school_ai_proctor_sessions"("id","school_id","campus_id");
CREATE INDEX "school_ai_proctor_sessions_school_id_campus_id_assignment_id_idx" ON "school_ai_proctor_sessions"("school_id","campus_id","assignment_id");
CREATE INDEX "school_ai_proctor_sessions_school_id_status_retention_until_idx" ON "school_ai_proctor_sessions"("school_id","status","retention_until");
CREATE TABLE "school_ai_proctor_clips" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "school_id" TEXT NOT NULL DEFAULT '',
  "campus_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL CHECK ("sequence" >= 0),
  "storage_key" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL CHECK ("bytes" > 0),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "school_ai_proctor_clips_session_id_school_id_campus_id_fkey" FOREIGN KEY ("session_id","school_id","campus_id") REFERENCES "school_ai_proctor_sessions"("id","school_id","campus_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "school_ai_proctor_clips_storage_key_key" ON "school_ai_proctor_clips"("storage_key");
CREATE UNIQUE INDEX "school_ai_proctor_clips_session_id_sequence_key" ON "school_ai_proctor_clips"("session_id","sequence");
CREATE INDEX "school_ai_proctor_clips_school_id_status_created_at_idx" ON "school_ai_proctor_clips"("school_id","status","created_at");
ALTER TABLE "school_ai_proctor_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_proctor_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_ai_proctor_sessions" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));
ALTER TABLE "school_ai_proctor_clips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_ai_proctor_clips" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_ai_proctor_clips" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));
