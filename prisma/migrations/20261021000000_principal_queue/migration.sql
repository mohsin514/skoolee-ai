-- SKO-417: principal queue overlay (assignment, acknowledgement, reasoned snooze) and its history.
-- CreateTable
CREATE TABLE "queue_item_states" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "assignee_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "snoozed_until" TIMESTAMP(3),
    "snooze_reason" TEXT,
    "resolved_at" TIMESTAMP(3),
    "title" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_item_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_item_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assignee_id" TEXT,
    "snoozed_until" TIMESTAMP(3),
    "note" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_item_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queue_item_states_school_id_idx" ON "queue_item_states"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_item_states_campus_id_item_key_key" ON "queue_item_states"("campus_id", "item_key");

-- CreateIndex
CREATE INDEX "queue_item_events_campus_id_item_key_created_at_idx" ON "queue_item_events"("campus_id", "item_key", "created_at");

-- CreateIndex
CREATE INDEX "queue_item_events_school_id_idx" ON "queue_item_events"("school_id");

-- AddForeignKey
ALTER TABLE "queue_item_states" ADD CONSTRAINT "queue_item_states_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_item_events" ADD CONSTRAINT "queue_item_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "queue_item_states" ADD CONSTRAINT "queue_item_states_snooze_check" CHECK (snoozed_until IS NULL OR snooze_reason IS NOT NULL);
ALTER TABLE "queue_item_events" ADD CONSTRAINT "queue_item_events_kind_check" CHECK (kind IN ('ASSIGNED','ACKNOWLEDGED','SNOOZED','UNSNOOZED','RESOLVED'));
