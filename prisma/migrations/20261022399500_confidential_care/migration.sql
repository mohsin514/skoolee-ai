-- CreateTable
CREATE TABLE "confidential_settings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "procedure_reference" TEXT,
    "lead_user_id" TEXT,
    "retention_months" INTEGER,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "confidential_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confidential_members" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "granted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "confidential_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_accesses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confidential_access_logs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT,
    "student_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "emergency_access_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confidential_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_visits" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "arrived_at" TIMESTAMP(3) NOT NULL,
    "observation" TEXT NOT NULL,
    "action_taken" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plans" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "allergies" TEXT,
    "action_plan" TEXT,
    "teacher_summary" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_instructions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "medicine" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "authorized_by" TEXT NOT NULL,
    "authorization_ref" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_doses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "instruction_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "given_at" TIMESTAMP(3) NOT NULL,
    "dose" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_doses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_concerns" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "escalation" TEXT,
    "implicated_guardian_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "safeguarding_concerns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_entries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "concern_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_disclosures" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "concern_id" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "recipient_name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposed_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_disclosures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "confidential_settings_campus_id_domain_key" ON "confidential_settings"("campus_id", "domain");

-- CreateIndex
CREATE INDEX "confidential_members_school_id_user_id_domain_idx" ON "confidential_members"("school_id", "user_id", "domain");

-- CreateIndex
CREATE INDEX "emergency_accesses_school_id_user_id_student_id_idx" ON "emergency_accesses"("school_id", "user_id", "student_id");

-- CreateIndex
CREATE INDEX "confidential_access_logs_school_id_domain_created_at_idx" ON "confidential_access_logs"("school_id", "domain", "created_at");

-- CreateIndex
CREATE INDEX "clinic_visits_school_id_student_id_idx" ON "clinic_visits"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_plans_student_id_key" ON "care_plans"("student_id");

-- CreateIndex
CREATE INDEX "care_plans_school_id_idx" ON "care_plans"("school_id");

-- CreateIndex
CREATE INDEX "medication_instructions_school_id_student_id_idx" ON "medication_instructions"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "medication_doses_school_id_student_id_idx" ON "medication_doses"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "safeguarding_concerns_school_id_campus_id_status_idx" ON "safeguarding_concerns"("school_id", "campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "safeguarding_concerns_school_id_reference_key" ON "safeguarding_concerns"("school_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "safeguarding_concerns_reporter_id_idempotency_key_key" ON "safeguarding_concerns"("reporter_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "safeguarding_entries_school_id_concern_id_idx" ON "safeguarding_entries"("school_id", "concern_id");

-- CreateIndex
CREATE INDEX "safeguarding_disclosures_school_id_concern_id_idx" ON "safeguarding_disclosures"("school_id", "concern_id");

-- AddForeignKey
ALTER TABLE "confidential_settings" ADD CONSTRAINT "confidential_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidential_members" ADD CONSTRAINT "confidential_members_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_accesses" ADD CONSTRAINT "emergency_accesses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidential_access_logs" ADD CONSTRAINT "confidential_access_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_instructions" ADD CONSTRAINT "medication_instructions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_instruction_id_fkey" FOREIGN KEY ("instruction_id") REFERENCES "medication_instructions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_entries" ADD CONSTRAINT "safeguarding_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_entries" ADD CONSTRAINT "safeguarding_entries_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "safeguarding_concerns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_disclosures" ADD CONSTRAINT "safeguarding_disclosures_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_disclosures" ADD CONSTRAINT "safeguarding_disclosures_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "safeguarding_concerns"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-439: closed sets; one active membership per user, domain and campus; emergency access is short;
-- a reviewed disclosure names its reviewer, who is not its proposer.
CREATE UNIQUE INDEX "confidential_members_active_key" ON "confidential_members" ("campus_id", "domain", "user_id") WHERE "revoked_at" IS NULL;
ALTER TABLE "confidential_settings" ADD CONSTRAINT "confidential_settings_domain_check" CHECK ("domain" IN ('CLINIC','SAFEGUARDING') AND (NOT "enabled" OR ("confirmed_at" IS NOT NULL AND "lead_user_id" IS NOT NULL AND length(coalesce("procedure_reference", '')) > 0 AND "retention_months" > 0)));
ALTER TABLE "confidential_members" ADD CONSTRAINT "confidential_members_check" CHECK ("domain" IN ('CLINIC','SAFEGUARDING') AND "role" IN ('NURSE','CLINIC_STAFF','LEAD','DEPUTY'));
ALTER TABLE "emergency_accesses" ADD CONSTRAINT "emergency_accesses_check" CHECK ("domain" IN ('CLINIC','SAFEGUARDING') AND "expires_at" > "created_at" AND "expires_at" - "created_at" <= interval '4 hours' AND length(btrim("purpose")) > 0);
ALTER TABLE "clinic_visits" ADD CONSTRAINT "clinic_visits_outcome_check" CHECK ("outcome" IN ('RETURNED_TO_CLASS','SENT_HOME','EMERGENCY_SERVICES','STAYED_IN_CLINIC') AND length(btrim("observation")) > 0);
ALTER TABLE "medication_instructions" ADD CONSTRAINT "medication_instructions_window_check" CHECK ("valid_until" > "valid_from" AND length(btrim("authorization_ref")) > 0);
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_state_check" CHECK ("source" IN ('STAFF_OBSERVATION','DISCLOSURE_BY_PUPIL','THIRD_PARTY','OTHER') AND "status" IN ('NEW','TRIAGED','ESCALATED','CLOSED') AND ("escalation" IS NULL OR "escalation" IN ('INTERNAL_REVIEW','EXTERNAL_REFERRAL')) AND ("status" = 'NEW' OR "owner_id" IS NOT NULL) AND length(btrim("observation")) > 0);
ALTER TABLE "safeguarding_disclosures" ADD CONSTRAINT "safeguarding_disclosures_check" CHECK ("recipient_type" IN ('GUARDIAN','STAFF','EXTERNAL_AGENCY') AND "status" IN ('PROPOSED','APPROVED','DECLINED','RELEASED') AND ("status" = 'PROPOSED' OR ("reviewed_by_id" IS NOT NULL AND "reviewed_by_id" <> "proposed_by_id")));
