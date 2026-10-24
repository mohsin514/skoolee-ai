-- SKO-432: stable identity for each committed bank transaction (no double import or posting).
-- CreateTable
CREATE TABLE "bank_transaction_keys" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "row_key" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_transaction_keys_school_id_idx" ON "bank_transaction_keys"("school_id");

-- CreateIndex
CREATE INDEX "bank_transaction_keys_reconciliation_id_idx" ON "bank_transaction_keys"("reconciliation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_keys_campus_id_row_key_key" ON "bank_transaction_keys"("campus_id", "row_key");

-- AddForeignKey
ALTER TABLE "bank_transaction_keys" ADD CONSTRAINT "bank_transaction_keys_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_keys" ADD CONSTRAINT "bank_transaction_keys_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

