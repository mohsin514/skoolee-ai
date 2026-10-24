-- AlterTable
ALTER TABLE "workflow_jobs" ADD COLUMN     "support_grant_id" TEXT;

-- CreateTable
CREATE TABLE "support_incidents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "owner_actor_id" TEXT NOT NULL,
    "closure_evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "support_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_grants" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "purpose" TEXT NOT NULL,
    "scope" TEXT[],
    "actions" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "emergency_reason" TEXT,
    "review_due_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "review_evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_actions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "support_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_incidents_reference_key" ON "support_incidents"("reference");

-- CreateIndex
CREATE INDEX "support_incidents_school_id_status_updated_at_idx" ON "support_incidents"("school_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "support_grants_school_id_status_expires_at_idx" ON "support_grants"("school_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "support_grants_incident_id_idx" ON "support_grants"("incident_id");

-- CreateIndex
CREATE INDEX "support_actions_grant_id_status_idx" ON "support_actions"("grant_id", "status");

-- CreateIndex
CREATE INDEX "support_actions_school_id_idx" ON "support_actions"("school_id");

-- CreateIndex
CREATE INDEX "workflow_jobs_support_grant_id_state_idx" ON "workflow_jobs"("support_grant_id", "state");

-- AddForeignKey
ALTER TABLE "support_incidents" ADD CONSTRAINT "support_incidents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "support_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_actions" ADD CONSTRAINT "support_actions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_actions" ADD CONSTRAINT "support_actions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "support_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
