-- SKO-550 Slice 1d: AI Workflows runtime. Durable jobs, user-authored evidence segments, plan steps,
-- a write-ahead intent ledger, questions, hash-bound confirmations, hand-offs, an id-only event log,
-- masked capability gaps and per-role first-login responses. Every row carries school_id; children
-- reference (job_id, school_id) so a row can never point at another school's job.
-- Typed school operations keep SchoolAiExecution receipts; SKO-470 scheduled runs are untouched.
-- No existing table changes. Legacy AUTOMATIC_* request rows stay readable and are not converted.

CREATE TABLE "ai_workflow_jobs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "access_version" INTEGER NOT NULL,
    "session_token_hash" TEXT,
    "origin" TEXT NOT NULL,
    "conversation_id" TEXT,
    "setup_response_id" TEXT,
    "setup_response_version" INTEGER,
    "parent_job_id" TEXT,
    "school_ai_run_id" TEXT,
    "language" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "outcome" TEXT,
    "plan_version" INTEGER NOT NULL DEFAULT 0,
    "plan_mode" TEXT NOT NULL DEFAULT 'STEPWISE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "lease_token" TEXT,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "next_wake_at" TIMESTAMP(3),
    "budget" JSONB NOT NULL,
    "usage" JSONB NOT NULL DEFAULT '{}',
    "reserved_credits" INTEGER NOT NULL DEFAULT 0,
    "credits_charged" INTEGER NOT NULL DEFAULT 0,
    "reservation_expires_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_params" JSONB,
    "unscoped_reason" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_workflow_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_segments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "field_key" TEXT,
    "text" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_steps" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "job_id" TEXT NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "step_key" TEXT NOT NULL,
    "capability_key" TEXT NOT NULL,
    "capability_version" INTEGER NOT NULL,
    "static_class" TEXT NOT NULL,
    "effective_class" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "depends_on" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model_input" JSONB NOT NULL,
    "bound_input" JSONB,
    "input_hash" TEXT,
    "input_provenance" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "missing_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preview" JSONB,
    "preview_hash" TEXT,
    "preview_version" INTEGER NOT NULL DEFAULT 0,
    "context_fingerprint" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "handoff_id" TEXT,
    "receipt" JSONB,
    "error_code" TEXT,
    "error_params" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_intents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "job_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "capability_key" TEXT NOT NULL,
    "capability_version" INTEGER NOT NULL,
    "input_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'INTENT',
    "receipt" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),

    CONSTRAINT "ai_workflow_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_questions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "step_id" TEXT,
    "pointer" TEXT,
    "kind" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "prompt_params" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" JSONB,
    "answered_by_id" TEXT,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_confirmations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "preview_version" INTEGER NOT NULL,
    "preview_hash" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "job_version" INTEGER NOT NULL,
    "batch_id" TEXT,
    "set_hash" TEXT,
    "confirmed_by_id" TEXT NOT NULL,
    "session_token_hash" TEXT,
    "client_command_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_handoffs" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "job_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_route" TEXT NOT NULL,
    "target_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin_role" TEXT NOT NULL,
    "origin_user_id" TEXT NOT NULL,
    "record_id" TEXT,
    "record_version" INTEGER,
    "domain_ref" JSONB,
    "prefill" JSONB,
    "prefill_hash" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "claimed_by_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "claim_expires_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "completed_model" TEXT,
    "completed_id" TEXT,
    "completed_receipt" JSONB,
    "diff" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflow_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_workflow_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "step_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_capability_gaps" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "nearest_key" TEXT NOT NULL DEFAULT '',
    "masked_summary" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_capability_gaps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_setup_responses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "questionnaire_key" TEXT NOT NULL,
    "definition_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "confirmed_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deferrals" INTEGER NOT NULL DEFAULT 0,
    "job_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_setup_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_workflow_jobs_status_next_wake_at_idx" ON "ai_workflow_jobs"("status", "next_wake_at");

CREATE INDEX "ai_workflow_jobs_school_id_actor_id_updated_at_idx" ON "ai_workflow_jobs"("school_id", "actor_id", "updated_at");

CREATE UNIQUE INDEX "ai_workflow_jobs_id_school_id_key" ON "ai_workflow_jobs"("id", "school_id");

CREATE UNIQUE INDEX "ai_workflow_jobs_school_id_actor_id_idempotency_key_key" ON "ai_workflow_jobs"("school_id", "actor_id", "idempotency_key");

CREATE INDEX "ai_workflow_segments_school_id_job_id_idx" ON "ai_workflow_segments"("school_id", "job_id");

CREATE UNIQUE INDEX "ai_workflow_segments_job_id_ordinal_key" ON "ai_workflow_segments"("job_id", "ordinal");

CREATE INDEX "ai_workflow_steps_school_id_job_id_status_idx" ON "ai_workflow_steps"("school_id", "job_id", "status");

CREATE UNIQUE INDEX "ai_workflow_steps_id_school_id_key" ON "ai_workflow_steps"("id", "school_id");

CREATE UNIQUE INDEX "ai_workflow_steps_job_id_plan_version_step_key_key" ON "ai_workflow_steps"("job_id", "plan_version", "step_key");

CREATE UNIQUE INDEX "ai_workflow_steps_school_id_idempotency_key_key" ON "ai_workflow_steps"("school_id", "idempotency_key");

CREATE INDEX "ai_workflow_intents_school_id_state_created_at_idx" ON "ai_workflow_intents"("school_id", "state", "created_at");

CREATE UNIQUE INDEX "ai_workflow_intents_school_id_actor_id_idempotency_key_key" ON "ai_workflow_intents"("school_id", "actor_id", "idempotency_key");

CREATE INDEX "ai_workflow_questions_school_id_job_id_status_idx" ON "ai_workflow_questions"("school_id", "job_id", "status");

CREATE UNIQUE INDEX "ai_workflow_confirmations_step_id_preview_version_key" ON "ai_workflow_confirmations"("step_id", "preview_version");

CREATE UNIQUE INDEX "ai_workflow_confirmations_school_id_confirmed_by_id_client__key" ON "ai_workflow_confirmations"("school_id", "confirmed_by_id", "client_command_id");

CREATE UNIQUE INDEX "ai_workflow_handoffs_step_id_key" ON "ai_workflow_handoffs"("step_id");

CREATE INDEX "ai_workflow_handoffs_school_id_campus_id_status_kind_idx" ON "ai_workflow_handoffs"("school_id", "campus_id", "status", "kind");

CREATE UNIQUE INDEX "ai_workflow_handoffs_school_id_idempotency_key_key" ON "ai_workflow_handoffs"("school_id", "idempotency_key");

CREATE INDEX "ai_workflow_events_school_id_job_id_idx" ON "ai_workflow_events"("school_id", "job_id");

CREATE UNIQUE INDEX "ai_workflow_events_job_id_seq_key" ON "ai_workflow_events"("job_id", "seq");

CREATE UNIQUE INDEX "ai_capability_gaps_school_id_actor_role_nearest_key_reason_key" ON "ai_capability_gaps"("school_id", "actor_role", "nearest_key", "reason");

CREATE UNIQUE INDEX "ai_setup_responses_school_id_user_id_questionnaire_key_key" ON "ai_setup_responses"("school_id", "user_id", "questionnaire_key");

ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_segments" ADD CONSTRAINT "ai_workflow_segments_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_steps" ADD CONSTRAINT "ai_workflow_steps_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_intents" ADD CONSTRAINT "ai_workflow_intents_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_questions" ADD CONSTRAINT "ai_workflow_questions_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_confirmations" ADD CONSTRAINT "ai_workflow_confirmations_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_handoffs" ADD CONSTRAINT "ai_workflow_handoffs_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_events" ADD CONSTRAINT "ai_workflow_events_job_id_school_id_fkey" FOREIGN KEY ("job_id", "school_id") REFERENCES "ai_workflow_jobs"("id", "school_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_capability_gaps" ADD CONSTRAINT "ai_capability_gaps_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_setup_responses" ADD CONSTRAINT "ai_setup_responses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_setup_responses" ADD CONSTRAINT "ai_setup_responses_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- State columns are closed vocabularies.
ALTER TABLE "ai_workflow_jobs"
  ADD CONSTRAINT "ai_workflow_jobs_origin_check" CHECK ("origin" IN ('FREEFORM', 'QUESTIONNAIRE', 'FOLLOW_UP', 'UNDO')),
  ADD CONSTRAINT "ai_workflow_jobs_status_check" CHECK ("status" IN ('PLANNING', 'NEEDS_INPUT', 'PLAN_REVIEW', 'RUNNING', 'WAITING_CONFIRM', 'WAITING_HANDOFF', 'PAUSED', 'BLOCKED', 'FAILED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  ADD CONSTRAINT "ai_workflow_jobs_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('EXECUTED', 'PARTIAL', 'ANSWERED', 'PLAN_SAVED', 'AWAITING_APPROVAL', 'NOT_SUPPORTED', 'NOTHING_DONE')),
  ADD CONSTRAINT "ai_workflow_jobs_language_check" CHECK ("language" IN ('en', 'ar', 'ur')),
  ADD CONSTRAINT "ai_workflow_jobs_plan_mode_check" CHECK ("plan_mode" IN ('STEPWISE', 'PLAN_REVIEW')),
  ADD CONSTRAINT "ai_workflow_jobs_credits_check" CHECK ("reserved_credits" >= 0 AND "credits_charged" >= 0),
  ADD CONSTRAINT "ai_workflow_jobs_lease_check" CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL));
ALTER TABLE "ai_workflow_steps"
  ADD CONSTRAINT "ai_workflow_steps_class_check" CHECK ("static_class" IN ('A', 'B', 'C') AND "effective_class" IN ('A', 'B', 'C') AND "effective_class" >= "static_class"),
  ADD CONSTRAINT "ai_workflow_steps_status_check" CHECK ("status" IN ('PENDING', 'NEEDS_INPUT', 'READY', 'WAITING_CONFIRM', 'RUNNING', 'SUCCEEDED', 'WAITING_HANDOFF', 'HANDED_OFF_DONE', 'BLOCKED', 'STALE', 'UNCERTAIN', 'FAILED', 'FAILED_UNVERIFIED', 'SKIPPED', 'CANCELLED'));
ALTER TABLE "ai_workflow_intents"
  ADD CONSTRAINT "ai_workflow_intents_state_check" CHECK ("state" IN ('INTENT', 'COMMITTED', 'RECONCILED', 'UNCERTAIN', 'FAILED')),
  ADD CONSTRAINT "ai_workflow_intents_receipt_check" CHECK (("state" IN ('COMMITTED', 'RECONCILED')) = ("receipt" IS NOT NULL AND "committed_at" IS NOT NULL));
ALTER TABLE "ai_workflow_questions"
  ADD CONSTRAINT "ai_workflow_questions_status_check" CHECK ("status" IN ('OPEN', 'ANSWERED', 'DISMISSED', 'SUPERSEDED'));
ALTER TABLE "ai_workflow_handoffs"
  ADD CONSTRAINT "ai_workflow_handoffs_kind_check" CHECK ("kind" IN ('RECORD_APPROVAL', 'DOMAIN_REQUEST', 'DOMAIN_SCREEN', 'ROLE_TASK', 'DEEP_LINK')),
  ADD CONSTRAINT "ai_workflow_handoffs_status_check" CHECK ("status" IN ('OPEN', 'CLAIMED', 'COMPLETED', 'COMPLETED_WITH_CHANGES', 'DECLINED', 'EXPIRED', 'SUPERSEDED'));
ALTER TABLE "ai_setup_responses"
  ADD CONSTRAINT "ai_setup_responses_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPLYING', 'READY', 'PARTIAL', 'DEFERRED', 'SKIPPED'));

-- Red team: two tabs or devices must not compile the same questionnaire twice (duplicate invitations
-- cannot be recalled). At most one live job per response, and one job ever per response version.
CREATE UNIQUE INDEX "ai_workflow_jobs_live_setup_response_key" ON "ai_workflow_jobs" ("setup_response_id")
  WHERE "setup_response_id" IS NOT NULL AND "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE UNIQUE INDEX "ai_workflow_jobs_setup_response_version_key" ON "ai_workflow_jobs" ("setup_response_id", "setup_response_version")
  WHERE "setup_response_id" IS NOT NULL;
