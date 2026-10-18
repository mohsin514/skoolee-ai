-- CreateTable
CREATE TABLE "payroll_policies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "package_label" TEXT NOT NULL,
    "scope_note" TEXT NOT NULL,
    "proration_basis" TEXT NOT NULL,
    "leave_divisor" TEXT NOT NULL,
    "leave_year_start_month" INTEGER NOT NULL,
    "rounding" TEXT NOT NULL,
    "require_separation" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_providers" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currencies" TEXT[],
    "columns" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_employees" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_ids" JSONB NOT NULL DEFAULT '{}',
    "leaving_date" DATE,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "entered_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_calculations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "policy_id" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "correction_of_id" TEXT,
    "scope_user_ids" TEXT[],
    "inputs" JSONB NOT NULL,
    "input_hash" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL DEFAULT '[]',
    "total_net" INTEGER NOT NULL,
    "prepared_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "stale_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_submissions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "calculation_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "file" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "history" JSONB NOT NULL DEFAULT '[]',
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "payroll_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_policies_school_id_idx" ON "payroll_policies"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_policies_campus_id_version_key" ON "payroll_policies"("campus_id", "version");

-- CreateIndex
CREATE INDEX "payroll_providers_school_id_idx" ON "payroll_providers"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_providers_campus_id_code_version_key" ON "payroll_providers"("campus_id", "code", "version");

-- CreateIndex
CREATE INDEX "payroll_employees_campus_id_idx" ON "payroll_employees"("campus_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employees_school_id_user_id_key" ON "payroll_employees"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_campus_id_year_month_idx" ON "payroll_adjustments"("campus_id", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_adjustments_school_id_idx" ON "payroll_adjustments"("school_id");

-- CreateIndex
CREATE INDEX "payroll_calculations_school_id_idx" ON "payroll_calculations"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_calculations_campus_id_year_month_version_key" ON "payroll_calculations"("campus_id", "year", "month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_submissions_calculation_id_key" ON "payroll_submissions"("calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_submissions_school_id_reference_key" ON "payroll_submissions"("school_id", "reference");

