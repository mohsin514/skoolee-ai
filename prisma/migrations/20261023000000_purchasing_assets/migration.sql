-- AlterTable
ALTER TABLE "item_transactions" ADD COLUMN     "idempotency_key" TEXT;

-- CreateTable
CREATE TABLE "purchase_budgets" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "cost_center" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "approval_limit" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "supplier_id" TEXT,
    "quote_ref" TEXT,
    "lines" JSONB NOT NULL,
    "received" JSONB NOT NULL DEFAULT '[]',
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_hash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "delivery_note" TEXT,
    "lines" JSONB NOT NULL,
    "discrepancies" JSONB NOT NULL DEFAULT '[]',
    "received_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "invoice_no" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "recorded_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_assets" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "request_id" TEXT,
    "receipt_id" TEXT,
    "location" TEXT,
    "custodian" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "next_service_on" DATE,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_services" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "work" TEXT,
    "completed_on" DATE,
    "next_due_on" DATE,
    "completed_by_id" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_budgets_campus_id_cost_center_period_key" ON "purchase_budgets"("campus_id", "cost_center", "period");

-- CreateIndex
CREATE INDEX "purchase_requests_budget_id_status_idx" ON "purchase_requests"("budget_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_campus_id_po_number_key" ON "purchase_requests"("campus_id", "po_number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_request_id_idempotency_key_key" ON "goods_receipts"("request_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "supplier_invoices_request_id_idx" ON "supplier_invoices"("request_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_school_id_invoice_no_idx" ON "supplier_invoices"("school_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "school_assets_campus_id_tag_key" ON "school_assets"("campus_id", "tag");

-- CreateIndex
CREATE INDEX "asset_services_asset_id_status_idx" ON "asset_services"("asset_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "item_transactions_school_id_idempotency_key_key" ON "item_transactions"("school_id", "idempotency_key");

