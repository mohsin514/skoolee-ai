-- CreateTable
CREATE TABLE "campus_packages" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "package" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "operators" JSONB NOT NULL DEFAULT '{}',
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "enabled_by_id" TEXT,
    "enabled_at" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_items" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "service_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "allergens" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canteen_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_orders" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hold_reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "ordered_by_id" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_ledger_entries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canteen_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_spend_limits" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "daily_limit" INTEGER NOT NULL,
    "set_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_spend_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietary_records" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "allergens" TEXT[],
    "diet" TEXT,
    "source" TEXT NOT NULL,
    "source_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION',
    "recorded_by_id" TEXT NOT NULL,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dietary_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boarding_leaves" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "depart_at" TIMESTAMP(3) NOT NULL,
    "expected_return_at" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "collected_by" TEXT NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "departed_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "returned_to" TEXT,
    "received_by_id" TEXT,
    "late_reason" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boarding_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boarding_roll_calls" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taken_by_id" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "boarding_roll_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campus_packages_school_id_idx" ON "campus_packages"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "campus_packages_campus_id_package_key" ON "campus_packages"("campus_id", "package");

-- CreateIndex
CREATE INDEX "canteen_items_school_id_campus_id_service_date_idx" ON "canteen_items"("school_id", "campus_id", "service_date");

-- CreateIndex
CREATE INDEX "canteen_orders_school_id_student_id_idx" ON "canteen_orders"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "canteen_orders_item_id_idx" ON "canteen_orders"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_orders_school_id_idempotency_key_key" ON "canteen_orders"("school_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "canteen_ledger_entries_school_id_student_id_idx" ON "canteen_ledger_entries"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_ledger_entries_order_id_kind_key" ON "canteen_ledger_entries"("order_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_spend_limits_school_id_student_id_key" ON "canteen_spend_limits"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "dietary_records_school_id_student_id_key" ON "dietary_records"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "boarding_leaves_school_id_campus_id_status_idx" ON "boarding_leaves"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "boarding_roll_calls_school_id_campus_id_taken_at_idx" ON "boarding_roll_calls"("school_id", "campus_id", "taken_at");

