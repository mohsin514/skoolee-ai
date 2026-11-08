-- SKO-433: refunds, credit notes and waivers as separately approved, appended adjustments.
-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "invoice_amount" INTEGER NOT NULL DEFAULT 0,
    "credit_amount" INTEGER NOT NULL DEFAULT 0,
    "reason_category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "public_explanation" TEXT NOT NULL,
    "private_note" TEXT,
    "source_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requester_id" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "approver_id" TEXT,
    "approver_name" TEXT,
    "decided_at" TIMESTAMP(3),
    "disbursement_ref" TEXT,
    "successor_payment_id" TEXT,
    "executed_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_adjustments_school_id_campus_id_status_idx" ON "financial_adjustments"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "financial_adjustments_invoice_id_idx" ON "financial_adjustments"("invoice_id");

-- CreateIndex
CREATE INDEX "financial_adjustments_payment_id_idx" ON "financial_adjustments"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_adjustments_school_id_requester_id_idempotency_ke_key" ON "financial_adjustments"("school_id", "requester_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only these kinds and states exist; amounts are positive minor units.
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_kind_check" CHECK (kind IN ('REFUND','CREDIT_NOTE','WAIVER'));
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_status_check" CHECK (status IN ('REQUESTED','DECLINED','APPLIED','APPROVED','DISBURSED','FAILED'));
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_amount_check" CHECK (amount > 0 AND invoice_amount >= 0 AND credit_amount >= 0);
