-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'OVERDUE';

-- DropIndex
DROP INDEX IF EXISTS "fee_structures_class_id_term_key";

-- DropIndex
DROP INDEX IF EXISTS "invoices_student_id_term_academic_year_key";

-- AlterTable
ALTER TABLE "fee_structures" DROP COLUMN IF EXISTS "annual_fee",
DROP COLUMN IF EXISTS "exam_fee",
DROP COLUMN IF EXISTS "months_count",
DROP COLUMN IF EXISTS "term",
DROP COLUMN IF EXISTS "tuition_monthly",
ADD COLUMN IF NOT EXISTS "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "active_to" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "compound_late_fee" BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "created_by" TEXT,
ADD COLUMN IF NOT EXISTS "discount_rules_json" JSONB,
ADD COLUMN IF NOT EXISTS "installment_type" TEXT,
ADD COLUMN IF NOT EXISTS "late_fee_percentage" DOUBLE PRECISION DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS "monthly_fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "one_time_fees_json" JSONB,
ADD COLUMN IF NOT EXISTS "tax_percentage" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updated_by" TEXT;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "academic_year",
DROP COLUMN IF EXISTS "challan_url",
DROP COLUMN IF EXISTS "term",
ADD COLUMN IF NOT EXISTS "balance_due" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "discount_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "email_sent_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "invoice_number" TEXT,
ADD COLUMN IF NOT EXISTS "late_fee_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "monthly_fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "one_time_fees" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pdf_url_s3" TEXT,
ADD COLUMN IF NOT EXISTS "sent_email" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sent_whatsapp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "subtotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tax_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "total_amount_paid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "whatsapp_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" DROP COLUMN IF EXISTS "amount_paid",
DROP COLUMN IF EXISTS "method",
DROP COLUMN IF EXISTS "paid_at",
ADD COLUMN IF NOT EXISTS "amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "campus_id" TEXT,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS "receipt_url_s3" TEXT,
ADD COLUMN IF NOT EXISTS "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "reference_number" TEXT,
ADD COLUMN IF NOT EXISTS "student_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_plans" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT,
    "student_id" TEXT,
    "original_amount_due" INTEGER NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "installments_json" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "import_date" TIMESTAMP(3) NOT NULL,
    "bank_file_url_s3" TEXT,
    "bank_account" TEXT,
    "statement_period_from" TIMESTAMP(3),
    "statement_period_to" TIMESTAMP(3),
    "total_transactions" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_count" INTEGER NOT NULL DEFAULT 0,
    "reconciliation_details_json" JSONB,
    "unmatched_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reconciled_by" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fee_structures_campus_id_class_id_idx" ON "fee_structures"("campus_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fee_structures_class_id_active_from_key" ON "fee_structures"("class_id", "active_from");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_student_id_due_date_idx" ON "invoices"("student_id", "due_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_campus_id_idx" ON "invoices"("campus_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_student_id_idx" ON "payments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_campus_id_payment_date_reference_number_key" ON "payments"("campus_id", "payment_date", "reference_number");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_structures_created_by_fkey') THEN
    ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_structures_updated_by_fkey') THEN
    ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_campus_id_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_student_id_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_campus_id_fkey') THEN
    ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_student_id_fkey') THEN
    ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_reconciliations_campus_id_fkey') THEN
    ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_reconciliations_reconciled_by_fkey') THEN
    ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
