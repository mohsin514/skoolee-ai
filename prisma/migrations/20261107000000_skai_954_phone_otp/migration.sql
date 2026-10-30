-- CreateTable
CREATE TABLE "phone_otp_challenges" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "phone_hash" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "user_id" TEXT,
    "flow_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "fallback_code_hash" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_deliveries" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "cost_micro_usd" INTEGER,
    "cost_verified" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "otp_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_otp_challenges_phone_hash_created_at_idx" ON "phone_otp_challenges"("phone_hash", "created_at");

-- CreateIndex
CREATE INDEX "phone_otp_challenges_expires_at_idx" ON "phone_otp_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "otp_deliveries_provider_message_id_key" ON "otp_deliveries"("provider_message_id");

-- CreateIndex
CREATE INDEX "otp_deliveries_challenge_id_idx" ON "otp_deliveries"("challenge_id");

-- CreateIndex
CREATE INDEX "otp_deliveries_market_sent_at_idx" ON "otp_deliveries"("market", "sent_at");

-- AddForeignKey
ALTER TABLE "otp_deliveries" ADD CONSTRAINT "otp_deliveries_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "phone_otp_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

