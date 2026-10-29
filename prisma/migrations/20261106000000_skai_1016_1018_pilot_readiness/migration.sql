-- SKAI-1016/1017/1018: persisted market trust reviews, pilot proposals, commercial stage events
-- and pilot readiness records. Additive only.
CREATE TABLE "market_trust_reviews" (
  "id" TEXT NOT NULL, "market" TEXT NOT NULL, "requirement" TEXT NOT NULL, "reference" TEXT NOT NULL,
  "reviewer" TEXT NOT NULL, "reviewed_at" TIMESTAMP(3) NOT NULL, "review_due_at" TIMESTAMP(3),
  "locales" TEXT[] DEFAULT ARRAY[]::TEXT[], "superseded_at" TIMESTAMP(3), "recorded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_trust_reviews_pkey" PRIMARY KEY ("id"));
CREATE INDEX "market_trust_reviews_market_requirement_superseded_at_idx" ON "market_trust_reviews"("market", "requirement", "superseded_at");

CREATE TABLE "pilot_proposals" (
  "id" TEXT NOT NULL, "school_id" TEXT NOT NULL, "version" INTEGER NOT NULL, "market" TEXT NOT NULL,
  "currency" TEXT NOT NULL, "amount" DECIMAL(14,2), "scope" JSONB NOT NULL, "budget_approver" TEXT,
  "academic_champion" TEXT, "data_processing_approver" TEXT, "problems" JSONB NOT NULL DEFAULT '[]',
  "recorded_by_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_proposals_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "pilot_proposals_school_id_version_key" ON "pilot_proposals"("school_id", "version");

CREATE TABLE "pilot_commercial_events" (
  "id" TEXT NOT NULL, "school_id" TEXT NOT NULL, "stage" TEXT NOT NULL,
  "demo_attended" BOOLEAN NOT NULL DEFAULT false, "declined_to_pay" BOOLEAN NOT NULL DEFAULT false,
  "signed_agreement_ref" TEXT, "settlement_ref" TEXT, "recorded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_commercial_events_pkey" PRIMARY KEY ("id"));
CREATE INDEX "pilot_commercial_events_school_id_created_at_idx" ON "pilot_commercial_events"("school_id", "created_at");

CREATE TABLE "pilot_readiness_records" (
  "id" TEXT NOT NULL, "school_id" TEXT NOT NULL, "pilot_id" TEXT, "version" INTEGER NOT NULL,
  "market" TEXT, "record" JSONB NOT NULL, "outcome" TEXT, "signer" TEXT,
  "ready" BOOLEAN NOT NULL DEFAULT false, "blockers" JSONB NOT NULL DEFAULT '[]',
  "recorded_by_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_readiness_records_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "pilot_readiness_records_school_id_version_key" ON "pilot_readiness_records"("school_id", "version");
CREATE INDEX "pilot_readiness_records_pilot_id_idx" ON "pilot_readiness_records"("pilot_id");
