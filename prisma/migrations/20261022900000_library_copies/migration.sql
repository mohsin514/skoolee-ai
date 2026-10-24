-- AlterTable
ALTER TABLE "book_issues" ADD COLUMN     "copy_id" TEXT,
ADD COLUMN     "policy_snapshot" JSONB,
ADD COLUMN     "renewals" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "return_condition" TEXT;

-- CreateTable
CREATE TABLE "book_copies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "hold_for" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_loan_policies" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "loan_days" INTEGER NOT NULL,
    "max_loans" INTEGER NOT NULL,
    "max_renewals" INTEGER NOT NULL,
    "grace_days" INTEGER NOT NULL,
    "fine_per_day" INTEGER NOT NULL,
    "fine_cap" INTEGER NOT NULL,
    "lost_charge" INTEGER NOT NULL,
    "hold_days" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "closures" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_loan_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_reservations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "copy_id" TEXT,
    "ready_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_charges" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "waived_by_id" TEXT,
    "waiver_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "book_copies_book_id_status_idx" ON "book_copies"("book_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_campus_id_barcode_key" ON "book_copies"("campus_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "library_loan_policies_campus_id_version_key" ON "library_loan_policies"("campus_id", "version");

-- CreateIndex
CREATE INDEX "book_reservations_book_id_status_created_at_idx" ON "book_reservations"("book_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "book_reservations_member_id_status_idx" ON "book_reservations"("member_id", "status");

-- CreateIndex
CREATE INDEX "library_charges_member_id_status_idx" ON "library_charges"("member_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "library_charges_issue_id_kind_key" ON "library_charges"("issue_id", "kind");

-- CreateIndex
CREATE INDEX "book_issues_copy_id_returned_at_idx" ON "book_issues"("copy_id", "returned_at");

