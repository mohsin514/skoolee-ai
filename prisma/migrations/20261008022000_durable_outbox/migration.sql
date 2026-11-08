-- CreateTable
CREATE TABLE "workflow_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reference_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "dispatch_count" INTEGER NOT NULL DEFAULT 0,
    "dispatched_at" TIMESTAMP(3),

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_jobs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "checkpoint" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "cancel_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_effects" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_effects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_events_available_at_lease_until_idx" ON "workflow_events"("available_at", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_events_school_id_identity_key" ON "workflow_events"("school_id", "identity");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_events_id_school_id_key" ON "workflow_events"("id", "school_id");

-- CreateIndex
CREATE INDEX "workflow_jobs_state_lease_until_idx" ON "workflow_jobs"("state", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_jobs_id_school_id_key" ON "workflow_jobs"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_effects_job_id_identity_key" ON "workflow_effects"("job_id", "identity");

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_id_school_id_fkey" FOREIGN KEY ("id", "school_id") REFERENCES "workflow_events"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_effects" ADD CONSTRAINT "workflow_effects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_effects" ADD CONSTRAINT "workflow_effects_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

