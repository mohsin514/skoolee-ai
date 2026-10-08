CREATE TABLE "onboarding_checkout_intents" (
  "id" TEXT NOT NULL,
  "school_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "billing_period" TEXT NOT NULL DEFAULT 'monthly',
  "catalogue_version" TEXT NOT NULL,
  "contract_snapshot" JSONB NOT NULL,
  "expected_campuses" INTEGER NOT NULL,
  "expected_enrollment" INTEGER NOT NULL,
  "return_step" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'NONE',
  "provider_reference" TEXT,
  "checkout_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amount" INTEGER,
  "currency" TEXT,
  "failure_reason" TEXT,
  "settled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboarding_checkout_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_checkout_intents_school_id_user_id_idempotency_key_key"
  ON "onboarding_checkout_intents"("school_id", "user_id", "idempotency_key");
CREATE INDEX "onboarding_checkout_intents_school_id_status_created_at_idx"
  ON "onboarding_checkout_intents"("school_id", "status", "created_at");
CREATE INDEX "onboarding_checkout_intents_provider_provider_reference_idx"
  ON "onboarding_checkout_intents"("provider", "provider_reference");

ALTER TABLE "onboarding_checkout_intents"
  ADD CONSTRAINT "onboarding_checkout_intents_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_checkout_intents"
  ADD CONSTRAINT "onboarding_checkout_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
