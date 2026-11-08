-- SKO-468: chart accounts can be deactivated instead of deleted; manual ledger entries are
-- idempotent per campus; corrections post a linked opposite entry and never edit the original.
-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "request_hash" TEXT,
ADD COLUMN     "reversal_of_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reversal_of_id_key" ON "ledger_entries"("reversal_of_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_campus_id_idempotency_key_key" ON "ledger_entries"("campus_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

