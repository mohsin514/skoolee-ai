-- SKO-373: provider receipts for every billing provider, with an operator review state.
ALTER TABLE "stripe_webhook_receipts" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "stripe_webhook_receipts" ADD COLUMN "school_id" TEXT;
ALTER TABLE "stripe_webhook_receipts" ADD COLUMN "review_note" TEXT;
ALTER TABLE "stripe_webhook_receipts" ADD COLUMN "reviewed_by_id" TEXT;
ALTER TABLE "stripe_webhook_receipts" ADD COLUMN "reviewed_at" TIMESTAMP(3);
