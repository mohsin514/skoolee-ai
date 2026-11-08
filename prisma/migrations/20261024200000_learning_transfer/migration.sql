-- CreateTable
CREATE TABLE "learning_transfer_cases" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "source_institution" TEXT NOT NULL,
    "source_learner_ref" TEXT NOT NULL,
    "source_curriculum_id" TEXT NOT NULL,
    "source_curriculum_name" TEXT NOT NULL,
    "source_version" TEXT NOT NULL,
    "source_language" TEXT,
    "source_hash" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "destination_record_id" TEXT,
    "destination_version" INTEGER,
    "consent_guardian_id" TEXT,
    "consent_scope" JSONB NOT NULL DEFAULT '[]',
    "consent_granted_at" TIMESTAMP(3),
    "consent_expires_at" TIMESTAMP(3),
    "consent_revoked_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "bridge" JSONB,
    "bridge_plan_id" TEXT,
    "downloads" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_transfer_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_transfer_mappings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "source_objective_id" TEXT NOT NULL,
    "source_objective_version" TEXT NOT NULL,
    "source_version" TEXT NOT NULL,
    "destination_version" INTEGER,
    "target_outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "suggestion" JSONB,
    "decision" TEXT NOT NULL DEFAULT 'PROPOSED',
    "note" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "learning_transfer_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_transfer_cases_school_id_campus_id_status_idx" ON "learning_transfer_cases"("school_id", "campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_transfer_cases_school_id_student_id_source_institu_key" ON "learning_transfer_cases"("school_id", "student_id", "source_institution", "source_learner_ref");

-- CreateIndex
CREATE INDEX "learning_transfer_mappings_school_id_case_id_idx" ON "learning_transfer_mappings"("school_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_transfer_mappings_case_id_source_objective_id_key" ON "learning_transfer_mappings"("case_id", "source_objective_id");

-- AddForeignKey
ALTER TABLE "learning_transfer_mappings" ADD CONSTRAINT "learning_transfer_mappings_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "learning_transfer_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

