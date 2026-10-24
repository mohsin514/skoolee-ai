-- SKO-414: per-plan working state (private groups, delivery, published tasks) with an event history.
CREATE TABLE "lesson_plan_states" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "groups" JSONB NOT NULL DEFAULT '[]',
    "delivery" JSONB,
    "published_activities" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lesson_plan_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lesson_plan_states_curriculum_id_plan_id_key" ON "lesson_plan_states"("curriculum_id", "plan_id");
CREATE INDEX "lesson_plan_states_school_id_idx" ON "lesson_plan_states"("school_id");

CREATE TABLE "lesson_plan_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "state_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lesson_plan_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lesson_plan_events_state_id_created_at_idx" ON "lesson_plan_events"("state_id", "created_at");
CREATE INDEX "lesson_plan_events_school_id_idx" ON "lesson_plan_events"("school_id");
