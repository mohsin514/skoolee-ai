-- SKO-431: instalment agreements bound to one invoice, with proposer and separate approver.
-- AlterTable
ALTER TABLE "payment_plans" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "invoice_id" TEXT,
ADD COLUMN     "paid_at_creation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "payment_plans_invoice_id_idx" ON "payment_plans"("invoice_id");

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one proposed or active plan per invoice.
CREATE UNIQUE INDEX "payment_plans_one_open_per_invoice" ON "payment_plans"("invoice_id") WHERE "status" IN ('proposed', 'active') AND "invoice_id" IS NOT NULL;
