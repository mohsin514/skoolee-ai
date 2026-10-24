-- Module 8 — Staff Records Depth
-- Add staff payroll / bank / documents / timeline tables.

CREATE TABLE "staff_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "designation" TEXT,
    "contract_type" TEXT,
    "basic_salary" INTEGER NOT NULL DEFAULT 0,
    "allowances_json" JSONB,
    "deductions_json" JSONB,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_name" TEXT,
    "social_links_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_timeline_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");
CREATE INDEX "staff_documents_user_id_uploaded_at_idx" ON "staff_documents"("user_id", "uploaded_at");
CREATE INDEX "staff_timeline_events_user_id_created_at_idx" ON "staff_timeline_events"("user_id", "created_at");

ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_timeline_events" ADD CONSTRAINT "staff_timeline_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
