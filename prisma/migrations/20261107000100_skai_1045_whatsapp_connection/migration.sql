-- SKAI-1045 (D3-01): per-school WhatsApp Business Account connection (Embedded Signup). Additive only.
CREATE TABLE "whatsapp_connections" (
  "id" TEXT NOT NULL, "school_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "waba_id" TEXT NOT NULL, "phone_number_id" TEXT NOT NULL, "business_id" TEXT,
  "display_phone_number" TEXT, "verified_name" TEXT, "access_token_enc" TEXT, "token_expires_at" TIMESTAMP(3),
  "connected_by_id" TEXT NOT NULL, "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnected_at" TIMESTAMP(3), "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "whatsapp_connections_school_id_key" ON "whatsapp_connections"("school_id");
CREATE INDEX "whatsapp_connections_phone_number_id_idx" ON "whatsapp_connections"("phone_number_id");
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
