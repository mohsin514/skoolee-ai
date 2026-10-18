-- CreateTable
CREATE TABLE "resource_policies" (
    "id" TEXT NOT NULL,
    "target_school_id" TEXT,
    "scope" TEXT NOT NULL,
    "limit_value" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "revoke_reason" TEXT,

    CONSTRAINT "resource_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_runs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "dataset" JSONB NOT NULL,
    "concurrency" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "objectives" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "policy_ids" TEXT[],
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_policies_target_school_id_scope_idx" ON "resource_policies"("target_school_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "performance_runs_run_id_key" ON "performance_runs"("run_id");

-- CreateIndex
CREATE INDEX "performance_runs_created_at_idx" ON "performance_runs"("created_at");


-- SKO-451: closed vocabularies and sane limits.
ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_scope_check" CHECK ("scope" IN ('BACKGROUND_REQUESTS','BACKGROUND_JOBS'));
ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_limit_check" CHECK ("limit_value" BETWEEN 0 AND 1000);
ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_tenant_expiry_check" CHECK ("target_school_id" IS NULL OR "expires_at" IS NOT NULL);
