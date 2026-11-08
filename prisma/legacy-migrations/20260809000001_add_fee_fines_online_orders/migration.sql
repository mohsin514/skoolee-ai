-- AlterTable
ALTER TABLE "payments" ADD COLUMN "fine_amount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "discount_amount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "note" TEXT;

-- CreateTable
CREATE TABLE "fee_fine_rules" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_fine_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_orders" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "order_ref" TEXT NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'SAFEPAY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "online_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_orders_order_ref_key" ON "online_payment_orders"("order_ref");

-- CreateIndex
CREATE INDEX "online_payment_orders_invoice_id_status_idx" ON "online_payment_orders"("invoice_id", "status");

-- AddForeignKey
ALTER TABLE "fee_fine_rules" ADD CONSTRAINT "fee_fine_rules_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_orders" ADD CONSTRAINT "online_payment_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_orders" ADD CONSTRAINT "online_payment_orders_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;