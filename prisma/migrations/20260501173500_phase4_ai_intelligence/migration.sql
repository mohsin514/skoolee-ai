ALTER TABLE IF EXISTS "ai_usage_logs"
  ADD COLUMN IF NOT EXISTS "school_id" TEXT,
  ADD COLUMN IF NOT EXISTS "campus_id" TEXT,
  ADD COLUMN IF NOT EXISTS "user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "feature" TEXT,
  ADD COLUMN IF NOT EXISTS "prompt_version" TEXT,
  ADD COLUMN IF NOT EXISTS "approval_status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "output" JSONB,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "ai_usage_logs_school_id_campus_id_idx"
  ON "ai_usage_logs"("school_id", "campus_id");
CREATE INDEX IF NOT EXISTS "ai_usage_logs_feature_idx"
  ON "ai_usage_logs"("feature");

CREATE TABLE IF NOT EXISTS "ai_insights" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "output" JSONB,
  "prompt_version" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "tokens_used" INTEGER NOT NULL DEFAULT 0,
  "approval_status" TEXT NOT NULL DEFAULT 'DRAFT',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ai_insights_school_id_campus_id_feature_idx"
  ON "ai_insights"("school_id", "campus_id", "feature");
CREATE INDEX IF NOT EXISTS "ai_insights_user_id_idx"
  ON "ai_insights"("user_id");

CREATE TABLE IF NOT EXISTS "ai_review_items" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT NOT NULL,
  "user_id" TEXT,
  "feature" TEXT NOT NULL,
  "related_type" TEXT NOT NULL,
  "related_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "draft" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "prompt_version" TEXT,
  "model" TEXT,
  "tokens_used" INTEGER NOT NULL DEFAULT 0,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ai_review_items_school_id_campus_id_status_idx"
  ON "ai_review_items"("school_id", "campus_id", "status");
CREATE INDEX IF NOT EXISTS "ai_review_items_related_type_related_id_idx"
  ON "ai_review_items"("related_type", "related_id");

CREATE TABLE IF NOT EXISTS "intervention_plans" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT NOT NULL,
  "student_id" TEXT,
  "created_by" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendations" JSONB,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "intervention_plans_school_id_campus_id_status_idx"
  ON "intervention_plans"("school_id", "campus_id", "status");
CREATE INDEX IF NOT EXISTS "intervention_plans_student_id_idx"
  ON "intervention_plans"("student_id");

CREATE TABLE IF NOT EXISTS "prompt_templates" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT,
  "campus_id" TEXT,
  "role" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "system_prompt" TEXT NOT NULL,
  "user_prompt" TEXT NOT NULL,
  "content" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "prompt_templates_school_id_campus_id_role_feature_idx"
  ON "prompt_templates"("school_id", "campus_id", "role", "feature");

CREATE TABLE IF NOT EXISTS "parent_conversations" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT,
  "user_id" TEXT NOT NULL,
  "student_id" TEXT,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'APPROVED_FAQ',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "parent_conversations_school_id_campus_id_user_id_idx"
  ON "parent_conversations"("school_id", "campus_id", "user_id");

CREATE TABLE IF NOT EXISTS "consent_logs" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT,
  "user_id" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "consent_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "consent_logs_school_id_campus_id_user_id_idx"
  ON "consent_logs"("school_id", "campus_id", "user_id");

INSERT INTO "prompt_templates" (
  "school_id",
  "campus_id",
  "role",
  "feature",
  "version",
  "system_prompt",
  "user_prompt",
  "content",
  "is_active",
  "status"
)
SELECT
  NULL,
  NULL,
  'PARENT',
  'school_faq',
  'global-approved-faq-v1',
  'Answer only from approved FAQ content.',
  'Use these approved general school FAQ answers when no school-specific FAQ has been configured.',
  '{
    "faqs": [
      {
        "question": "How can I get help with fees?",
        "answer": "Please contact the school office or campus administrator for fee questions, payment status, and challan support."
      },
      {
        "question": "How can I discuss academic progress?",
        "answer": "Please contact the class teacher or campus academic office to discuss marks, attendance, report cards, and study support."
      },
      {
        "question": "Where can I get report card support?",
        "answer": "Report-card questions should be shared with the campus office or principal so the official school record can be reviewed."
      }
    ]
  }'::jsonb,
  true,
  'APPROVED'
WHERE NOT EXISTS (
  SELECT 1
  FROM "prompt_templates"
  WHERE "feature" = 'school_faq'
    AND "version" = 'global-approved-faq-v1'
    AND "school_id" IS NULL
    AND "campus_id" IS NULL
);
