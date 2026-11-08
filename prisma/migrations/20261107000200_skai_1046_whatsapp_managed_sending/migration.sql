-- SKAI-1046 (D3-03): Skoolee-managed WhatsApp sending add-on and usage ledger. Additive only.
CREATE TABLE "whatsapp_managed_sending" (
  "id" TEXT NOT NULL, "school_id" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "phone_number_id" TEXT, "balance_micro_usd" BIGINT NOT NULL DEFAULT 0, "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_managed_sending_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_managed_sending_balance_check" CHECK ("balance_micro_usd" >= 0));
CREATE UNIQUE INDEX "whatsapp_managed_sending_school_id_key" ON "whatsapp_managed_sending"("school_id");
ALTER TABLE "whatsapp_managed_sending" ADD CONSTRAINT "whatsapp_managed_sending_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_usage_entries" (
  "id" TEXT NOT NULL, "school_id" TEXT NOT NULL, "kind" TEXT NOT NULL, "category" TEXT, "country" TEXT,
  "meta_rate_micro_usd" BIGINT NOT NULL DEFAULT 0, "margin_micro_usd" BIGINT NOT NULL DEFAULT 0,
  "amount_micro_usd" BIGINT NOT NULL, "provider_message_id" TEXT, "reference" TEXT, "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_usage_entries_pkey" PRIMARY KEY ("id"));
CREATE INDEX "whatsapp_usage_entries_school_id_created_at_idx" ON "whatsapp_usage_entries"("school_id", "created_at");
ALTER TABLE "whatsapp_usage_entries" ADD CONSTRAINT "whatsapp_usage_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
