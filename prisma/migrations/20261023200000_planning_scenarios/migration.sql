-- CreateTable
CREATE TABLE "planning_baselines" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "missing" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "planning_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_scenarios" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "baseline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "copied_from_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_handoffs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "scenario_version" INTEGER NOT NULL,
    "owner_id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposed_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planning_baselines_school_id_idx" ON "planning_baselines"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_baselines_campus_id_version_key" ON "planning_baselines"("campus_id", "version");

-- CreateIndex
CREATE INDEX "planning_scenarios_campus_id_baseline_id_idx" ON "planning_scenarios"("campus_id", "baseline_id");

-- CreateIndex
CREATE INDEX "planning_scenarios_school_id_idx" ON "planning_scenarios"("school_id");

-- CreateIndex
CREATE INDEX "planning_handoffs_scenario_id_idx" ON "planning_handoffs"("scenario_id");

-- CreateIndex
CREATE INDEX "planning_handoffs_school_id_idx" ON "planning_handoffs"("school_id");

