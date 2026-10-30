-- CreateTable
CREATE TABLE "evidence_frameworks" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_criteria" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "framework_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "interpretation" TEXT,
    "interpretation_approved_by_id" TEXT,
    "interpretation_approved_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evidence_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "framework_id" TEXT NOT NULL,
    "criterion_ids" TEXT[],
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "source_version" TEXT NOT NULL,
    "source_date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "owner_id" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'STAFF',
    "sensitivity" TEXT NOT NULL DEFAULT 'NONE',
    "stance" TEXT NOT NULL DEFAULT 'SUPPORTS',
    "review_by" DATE NOT NULL,
    "review_state" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_actions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "framework_id" TEXT NOT NULL,
    "criterion_ids" TEXT[],
    "title" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "expected_measure" TEXT NOT NULL,
    "intervention_plan_id" TEXT,
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "reassessment" JSONB,
    "reflection" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completion_evidence_id" TEXT,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "improvement_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_reviewer_grants" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "framework_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "criterion_ids" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "granted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_reviewer_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_packs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "framework_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "audience" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_frameworks_school_id_name_version_key" ON "evidence_frameworks"("school_id", "name", "version");

-- CreateIndex
CREATE INDEX "evidence_criteria_school_id_idx" ON "evidence_criteria"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_criteria_framework_id_code_key" ON "evidence_criteria"("framework_id", "code");

-- CreateIndex
CREATE INDEX "evidence_items_school_id_framework_id_idx" ON "evidence_items"("school_id", "framework_id");

-- CreateIndex
CREATE INDEX "improvement_actions_school_id_framework_id_idx" ON "improvement_actions"("school_id", "framework_id");

-- CreateIndex
CREATE INDEX "evidence_reviewer_grants_school_id_user_id_idx" ON "evidence_reviewer_grants"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "evidence_packs_school_id_idx" ON "evidence_packs"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_packs_framework_id_version_key" ON "evidence_packs"("framework_id", "version");

-- AddForeignKey
ALTER TABLE "evidence_frameworks" ADD CONSTRAINT "evidence_frameworks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_criteria" ADD CONSTRAINT "evidence_criteria_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "evidence_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "evidence_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "evidence_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_reviewer_grants" ADD CONSTRAINT "evidence_reviewer_grants_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "evidence_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "evidence_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-450: closed vocabularies.
ALTER TABLE "evidence_frameworks" ADD CONSTRAINT "evidence_frameworks_status_check" CHECK ("status" IN ('ACTIVE','RETIRED'));
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_type_check" CHECK ("source_type" IN ('INTERVENTION','REPORT_CARD','CLINIC_VISIT','CARE_PLAN','DOCUMENT'));
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_audience_check" CHECK ("audience" IN ('STAFF','REVIEWER','EXTERNAL'));
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_sensitivity_check" CHECK ("sensitivity" IN ('NONE','PUPIL','CLINIC'));
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_stance_check" CHECK ("stance" IN ('SUPPORTS','CONTRADICTS'));
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_review_state_check" CHECK ("review_state" IN ('PENDING','ACCEPTED','MORE_REQUESTED'));
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_status_check" CHECK ("status" IN ('OPEN','COMPLETED'));
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_audience_check" CHECK ("audience" IN ('STAFF','EXTERNAL'));
