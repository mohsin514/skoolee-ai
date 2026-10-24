-- CreateTable
CREATE TABLE "pathway_counsellors" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "pathway_counsellors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathway_goals" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "audience" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "next_review_on" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pathway_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathway_actions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "opportunity_id" TEXT,
    "evidence_link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "done_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathway_opportunities" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "eligibility" TEXT NOT NULL,
    "deadline" DATE,
    "last_verified_at" TIMESTAMP(3) NOT NULL,
    "verified_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counselling_appointments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "counsellor_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "public_label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counselling_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counselling_notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counselling_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_profiles" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT,
    "display_name" TEXT NOT NULL,
    "pathway" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "visibility" TEXT NOT NULL,
    "mentoring" BOOLEAN NOT NULL DEFAULT false,
    "consent_evidence" TEXT NOT NULL,
    "consent_given_at" TIMESTAMP(3) NOT NULL,
    "consent_withdrawn_at" TIMESTAMP(3),
    "review_due_on" DATE NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentoring_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "alumni_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "review_note" TEXT,
    "guardian_consent" BOOLEAN NOT NULL DEFAULT false,
    "safeguarding_checked" BOOLEAN NOT NULL DEFAULT false,
    "decided_at" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentoring_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pathway_counsellors_school_id_user_id_idx" ON "pathway_counsellors"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "pathway_goals_school_id_student_id_idx" ON "pathway_goals"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "pathway_actions_goal_id_idx" ON "pathway_actions"("goal_id");

-- CreateIndex
CREATE INDEX "pathway_opportunities_school_id_campus_id_status_idx" ON "pathway_opportunities"("school_id", "campus_id", "status");

-- CreateIndex
CREATE INDEX "counselling_appointments_school_id_counsellor_id_starts_at_idx" ON "counselling_appointments"("school_id", "counsellor_id", "starts_at");

-- CreateIndex
CREATE INDEX "counselling_appointments_school_id_student_id_idx" ON "counselling_appointments"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "counselling_notes_school_id_student_id_idx" ON "counselling_notes"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "alumni_profiles_school_id_campus_id_idx" ON "alumni_profiles"("school_id", "campus_id");

-- CreateIndex
CREATE INDEX "mentoring_requests_school_id_alumni_id_status_idx" ON "mentoring_requests"("school_id", "alumni_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mentoring_requests_school_id_reference_key" ON "mentoring_requests"("school_id", "reference");

