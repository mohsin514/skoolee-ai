ALTER TABLE "users" ADD COLUMN "preferred_language" TEXT;
ALTER TABLE "campuses" ADD COLUMN "locale_delegated_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "invoices" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'PKR', ADD COLUMN "locale_snapshot" JSONB;
CREATE TABLE "locale_policies" ("id" TEXT NOT NULL PRIMARY KEY, "school_id" TEXT NOT NULL, "campus_id" TEXT, "scope_key" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "settings" JSONB NOT NULL, "effective_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_by" TEXT NOT NULL, "finance_reviewed_by" TEXT, CONSTRAINT "locale_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "locale_policies_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "locale_scope_matches_campus" CHECK ("scope_key" = COALESCE("campus_id", 'school')));
CREATE UNIQUE INDEX "locale_policies_school_id_scope_key_effective_at_key" ON "locale_policies"("school_id", "scope_key", "effective_at");
CREATE INDEX "locale_policies_school_id_campus_id_effective_at_idx" ON "locale_policies"("school_id", "campus_id", "effective_at");
ALTER TABLE "notification_templates" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
