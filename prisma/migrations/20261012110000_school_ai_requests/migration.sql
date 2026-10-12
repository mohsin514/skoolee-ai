-- CreateTable
CREATE TABLE "school_ai_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "subject_id" TEXT,
    "class_id" TEXT,
    "feature" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claim_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "reply" TEXT,
    "record_id" TEXT,
    "context_record_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "school_ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_requests_school_id_campus_id_actor_id_created_at_idx" ON "school_ai_requests"("school_id", "campus_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "school_ai_requests_status_lease_expires_at_idx" ON "school_ai_requests"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_requests_school_id_actor_id_feature_idempotency_k_key" ON "school_ai_requests"("school_id", "actor_id", "feature", "idempotency_key");

-- AddForeignKey
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_requests" ADD CONSTRAINT "school_ai_requests_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "school_ai_requests"
  ADD CONSTRAINT "school_ai_requests_status_check" CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED')),
  ADD CONSTRAINT "school_ai_requests_feature_check" CHECK ("feature" = 'ASSISTANT'),
  ADD CONSTRAINT "school_ai_requests_attempts_check" CHECK ("attempts" BETWEEN 1 AND 10),
  ADD CONSTRAINT "school_ai_requests_reply_check" CHECK ("reply" IS NULL OR char_length("reply") BETWEEN 1 AND 8000),
  ADD CONSTRAINT "school_ai_requests_context_check" CHECK (jsonb_typeof("context_record_ids") = 'array' AND jsonb_array_length("context_record_ids") <= 12),
  ADD CONSTRAINT "school_ai_requests_subject_check" CHECK (("subject_id" IS NULL AND "class_id" IS NULL) OR ("subject_id" IS NOT NULL AND "class_id" IS NOT NULL AND "campus_id" IS NOT NULL)),
  ADD CONSTRAINT "school_ai_requests_state_check" CHECK (
    ("status" = 'PENDING' AND "claim_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "reply" IS NULL AND "completed_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NOT NULL AND "completed_at" IS NOT NULL)
    OR ("status" = 'FAILED' AND "claim_token" IS NULL AND "lease_expires_at" IS NULL AND "reply" IS NULL AND "completed_at" IS NULL)
  );
