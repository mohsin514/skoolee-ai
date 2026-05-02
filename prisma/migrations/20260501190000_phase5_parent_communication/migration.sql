CREATE TABLE IF NOT EXISTS "notification_templates" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT,
  "campus_id" TEXT,
  "key" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "variables" JSONB,
  "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
  "requires_approved_data" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "notification_templates_school_id_campus_id_key_channel_idx"
  ON "notification_templates"("school_id", "campus_id", "key", "channel");

CREATE TABLE IF NOT EXISTS "parent_communications" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" TEXT NOT NULL,
  "campus_id" TEXT,
  "student_id" TEXT,
  "parent_user_id" TEXT,
  "created_by_id" TEXT,
  "template_key" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipient_name" TEXT,
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "attachment_url" TEXT,
  "related_type" TEXT,
  "related_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider_message_id" TEXT,
  "failed_reason" TEXT,
  "metadata" JSONB,
  "approved_data" BOOLEAN NOT NULL DEFAULT false,
  "idempotency_key" TEXT UNIQUE,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "parent_communications_school_id_campus_id_created_at_idx"
  ON "parent_communications"("school_id", "campus_id", "created_at");
CREATE INDEX IF NOT EXISTS "parent_communications_student_id_idx"
  ON "parent_communications"("student_id");
CREATE INDEX IF NOT EXISTS "parent_communications_parent_user_id_idx"
  ON "parent_communications"("parent_user_id");
CREATE INDEX IF NOT EXISTS "parent_communications_status_idx"
  ON "parent_communications"("status");
CREATE INDEX IF NOT EXISTS "parent_communications_related_type_related_id_idx"
  ON "parent_communications"("related_type", "related_id");
