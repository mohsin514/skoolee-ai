-- CreateTable
CREATE TABLE "tax_activations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "package_code" TEXT NOT NULL,
    "package_version" INTEGER NOT NULL,
    "campus_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legal_name" TEXT NOT NULL,
    "tax_id" TEXT,
    "exempt_fee_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3),
    "owner_id" TEXT,
    "evidence_reviewer" TEXT,
    "evidence_reference" TEXT,
    "evidence_reviewed_at" TIMESTAMP(3),
    "config_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "prepared_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "number_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_fixture_runs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "activation_id" TEXT NOT NULL,
    "config_hash" TEXT NOT NULL,
    "fixtures" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "run_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_fixture_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_documents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "invoice_id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "package_code" TEXT NOT NULL,
    "package_version" INTEGER NOT NULL,
    "document_number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "currency" TEXT NOT NULL,
    "tax_amount" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "submission_status" TEXT NOT NULL DEFAULT 'NONE',
    "external_id" TEXT,
    "last_error" TEXT,
    "corrected_by_id" TEXT,
    "correction_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_submission_attempts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "document_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_activations_school_id_status_idx" ON "tax_activations"("school_id", "status");

-- CreateIndex
CREATE INDEX "tax_fixture_runs_school_id_activation_id_idx" ON "tax_fixture_runs"("school_id", "activation_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_invoice_id_key" ON "tax_documents"("invoice_id");

-- CreateIndex
CREATE INDEX "tax_documents_school_id_submission_status_idx" ON "tax_documents"("school_id", "submission_status");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_school_id_document_number_key" ON "tax_documents"("school_id", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_school_id_external_id_key" ON "tax_documents"("school_id", "external_id");

-- CreateIndex
CREATE INDEX "tax_submission_attempts_school_id_document_id_idx" ON "tax_submission_attempts"("school_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_submission_attempts_document_id_attempt_key" ON "tax_submission_attempts"("document_id", "attempt");

-- AddForeignKey
ALTER TABLE "tax_activations" ADD CONSTRAINT "tax_activations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_fixture_runs" ADD CONSTRAINT "tax_fixture_runs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_fixture_runs" ADD CONSTRAINT "tax_fixture_runs_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "tax_activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "tax_activations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_submission_attempts" ADD CONSTRAINT "tax_submission_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_submission_attempts" ADD CONSTRAINT "tax_submission_attempts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "tax_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-444: an activation goes live only with an owner, evidence, an effective date and a second approver; documents
-- carry an issue snapshot and a closed submission state.
ALTER TABLE "tax_activations" ADD CONSTRAINT "tax_activations_check" CHECK ("status" IN ('DRAFT','SCHEDULED','ACTIVE','SUPERSEDED','WITHDRAWN') AND ("status" NOT IN ('SCHEDULED','ACTIVE','SUPERSEDED') OR ("owner_id" IS NOT NULL AND "effective_from" IS NOT NULL AND "evidence_reviewed_at" IS NOT NULL AND length(btrim(coalesce("evidence_reference", ''))) > 0 AND "approved_by_id" IS NOT NULL AND "approved_by_id" <> "prepared_by_id" AND cardinality("campus_ids") > 0)));
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_check" CHECK ("submission_status" IN ('NONE','QUEUED','ACCEPTED','REJECTED','CORRECTED','NOT_SUPPORTED') AND "revision" >= 1 AND "tax_amount" >= 0 AND "total_amount" >= 0);
ALTER TABLE "tax_submission_attempts" ADD CONSTRAINT "tax_submission_attempts_outcome_check" CHECK ("outcome" IN ('ACCEPTED','REJECTED','TIMEOUT','RECONCILED_ACCEPTED','RECONCILED_MISSING'));
