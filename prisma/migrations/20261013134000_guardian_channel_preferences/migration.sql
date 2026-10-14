CREATE TABLE "guardian_channel_preferences" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "school_id" TEXT NOT NULL DEFAULT '' REFERENCES "schools"("id") ON DELETE CASCADE,
  "campus_id" TEXT NOT NULL REFERENCES "campuses"("id") ON DELETE CASCADE,
  "guardian_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" TEXT NOT NULL CHECK ("channel" IN ('EMAIL','SMS','WHATSAPP')),
  "recipient" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3),
  "consent_at" TIMESTAMP(3),
  "evidence" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_channel_preferences_enabled_evidence" CHECK (NOT "enabled" OR ("verified_at" IS NOT NULL AND "consent_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "guardian_channel_preferences_scope_channel_key" ON "guardian_channel_preferences"("school_id","campus_id","guardian_user_id","channel");
CREATE INDEX "guardian_channel_preferences_school_id_campus_id_idx" ON "guardian_channel_preferences"("school_id","campus_id");
ALTER TABLE "guardian_channel_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_channel_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "guardian_channel_preferences" USING ("school_id" = NULLIF(current_setting('app.current_school_id', true), '')) WITH CHECK ("school_id" = NULLIF(current_setting('app.current_school_id', true), ''));
