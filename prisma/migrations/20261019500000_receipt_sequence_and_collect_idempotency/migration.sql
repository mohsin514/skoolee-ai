-- SKO-432/475: receipt numbers come from one atomic counter per campus and year and are unique per
-- campus; a manual collection is bound to its operation key so a retried request replays its receipt.
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "request_hash" TEXT;

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "campus_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("campus_id","year")
);

-- CreateIndex
CREATE INDEX "receipt_sequences_school_id_idx" ON "receipt_sequences"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_school_id_recorded_by_idempotency_key_key" ON "payments"("school_id", "recorded_by", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_campus_id_receipt_no_key" ON "payments"("campus_id", "receipt_no");

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

