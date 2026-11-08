ALTER TABLE "schools"
  ADD COLUMN "subscription_lifecycle_state" TEXT NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "cancellation_effective_at" TIMESTAMP(3),
  ADD COLUMN "grace_ends_at" TIMESTAMP(3),
  ADD COLUMN "last_stripe_event_created" INTEGER;

UPDATE "schools"
SET "subscription_lifecycle_state" = CASE
  WHEN "status" = 'TRIAL' THEN 'TRIAL'
  WHEN "status" = 'ACTIVE' THEN 'ACTIVE'
  WHEN "status" = 'DELETED' THEN 'ENDED'
  ELSE 'PAST_DUE'
END;

CREATE TABLE "subscription_requests" (
  "id" TEXT NOT NULL,
  "school_id" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "requested_plan" TEXT,
  "effective_at" TIMESTAMP(3),
  "details" JSONB NOT NULL,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_requests_school_id_requested_by_id_idempotency_key_key"
  ON "subscription_requests"("school_id", "requested_by_id", "idempotency_key");
CREATE INDEX "subscription_requests_school_id_state_created_at_idx"
  ON "subscription_requests"("school_id", "state", "created_at");
ALTER TABLE "subscription_requests"
  ADD CONSTRAINT "subscription_requests_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subscription_requests_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stripe_webhook_receipts" (
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_created" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PROCESSING',
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "stripe_webhook_receipts_pkey" PRIMARY KEY ("event_id")
);
CREATE INDEX "stripe_webhook_receipts_state_received_at_idx"
  ON "stripe_webhook_receipts"("state", "received_at");
