-- CreateTable
CREATE TABLE "pilots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_school_id" TEXT,
    "country" TEXT NOT NULL,
    "curriculum" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "use_case" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "champion_name" TEXT NOT NULL,
    "measurement_owner_id" TEXT NOT NULL,
    "workflows" JSONB NOT NULL,
    "consent_reference" TEXT,
    "consent_recorded_at" TIMESTAMP(3),
    "case_study_permission" TEXT NOT NULL DEFAULT 'NONE',
    "permission_reference" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_observations" (
    "id" TEXT NOT NULL,
    "pilot_id" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "participant" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "active_seconds" INTEGER,
    "elapsed_seconds" INTEGER,
    "correction_seconds" INTEGER,
    "completed" BOOLEAN NOT NULL,
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "failure_note" TEXT,
    "source" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "excluded_reason" TEXT,
    "observed_on" DATE NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_measures" (
    "id" TEXT NOT NULL,
    "pilot_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workflow" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "value" DOUBLE PRECISION,
    "denominator" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "superseded_at" TIMESTAMP(3),
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_measures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_claims" (
    "id" TEXT NOT NULL,
    "pilot_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "statement" TEXT NOT NULL,
    "finding_key" TEXT NOT NULL,
    "identifiable" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB,
    "snapshot_hash" TEXT,
    "review_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pilots_country_curriculum_language_idx" ON "pilots"("country", "curriculum", "language");

-- CreateIndex
CREATE INDEX "pilot_observations_pilot_id_workflow_phase_idx" ON "pilot_observations"("pilot_id", "workflow", "phase");

-- CreateIndex
CREATE INDEX "pilot_measures_pilot_id_kind_idx" ON "pilot_measures"("pilot_id", "kind");

-- CreateIndex
CREATE INDEX "pilot_claims_pilot_id_status_idx" ON "pilot_claims"("pilot_id", "status");

-- AddForeignKey
ALTER TABLE "pilot_observations" ADD CONSTRAINT "pilot_observations_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "pilots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_measures" ADD CONSTRAINT "pilot_measures_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "pilots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_claims" ADD CONSTRAINT "pilot_claims_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "pilots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

