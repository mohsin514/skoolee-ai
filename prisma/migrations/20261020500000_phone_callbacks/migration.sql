-- SKO-465: reception call log with owned callbacks (due, attempts, reassignment, outcome) and durable history, restricted notes, phone search digits and a retry key.
-- AlterTable
ALTER TABLE "phone_call_logs" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "phone_digits" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "recorded_by_id" TEXT,
ADD COLUMN     "request_hash" TEXT,
ADD COLUMN     "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "phone_callbacks" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "previous_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_callbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_callback_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "callback_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "owner_id" TEXT,
    "due_at" TIMESTAMP(3),
    "note" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_callback_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_callbacks_campus_id_status_due_at_idx" ON "phone_callbacks"("campus_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "phone_callbacks_call_id_idx" ON "phone_callbacks"("call_id");

-- CreateIndex
CREATE INDEX "phone_callbacks_school_id_idx" ON "phone_callbacks"("school_id");

-- CreateIndex
CREATE INDEX "phone_callback_events_callback_id_created_at_idx" ON "phone_callback_events"("callback_id", "created_at");

-- CreateIndex
CREATE INDEX "phone_callback_events_school_id_idx" ON "phone_callback_events"("school_id");

-- CreateIndex
CREATE INDEX "phone_call_logs_campus_id_date_idx" ON "phone_call_logs"("campus_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "phone_call_logs_campus_id_idempotency_key_key" ON "phone_call_logs"("campus_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "phone_callbacks" ADD CONSTRAINT "phone_callbacks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_callbacks" ADD CONSTRAINT "phone_callbacks_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "phone_call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_callbacks" ADD CONSTRAINT "phone_callbacks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_callbacks" ADD CONSTRAINT "phone_callbacks_previous_id_fkey" FOREIGN KEY ("previous_id") REFERENCES "phone_callbacks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_callback_events" ADD CONSTRAINT "phone_callback_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_callback_events" ADD CONSTRAINT "phone_callback_events_callback_id_fkey" FOREIGN KEY ("callback_id") REFERENCES "phone_callbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Legacy rows: normalise direction, fill search digits, and turn each old follow-up date into an open, unassigned callback
-- (whether it was ever returned is unknown, so it is shown to reception rather than silently closed).
UPDATE "phone_call_logs" SET direction = 'IN' WHERE direction IN ('INCOMING', 'in');
UPDATE "phone_call_logs" SET direction = 'OUT' WHERE direction IN ('OUTGOING', 'out');
UPDATE "phone_call_logs" SET direction = 'IN' WHERE direction NOT IN ('IN', 'OUT');
UPDATE "phone_call_logs" SET phone_digits = regexp_replace(phone, '[^0-9]', '', 'g');
INSERT INTO "phone_callbacks" (id, school_id, campus_id, call_id, due_at, status, created_by_id, created_at)
SELECT gen_random_uuid()::text, school_id, campus_id, id, follow_up_date, 'OPEN', 'system', created_at FROM "phone_call_logs" WHERE follow_up_date IS NOT NULL;
INSERT INTO "phone_callback_events" (id, school_id, campus_id, callback_id, kind, due_at, actor_id, created_at)
SELECT gen_random_uuid()::text, school_id, campus_id, id, 'CREATED', due_at, 'system', created_at FROM "phone_callbacks";
ALTER TABLE "phone_call_logs" ADD CONSTRAINT "phone_call_logs_direction_check" CHECK (direction IN ('IN', 'OUT'));
ALTER TABLE "phone_callbacks" ADD CONSTRAINT "phone_callbacks_status_check" CHECK (status IN ('OPEN', 'DONE'));
ALTER TABLE "phone_callbacks" ADD CONSTRAINT "phone_callbacks_outcome_check" CHECK (status <> 'DONE' OR (outcome IS NOT NULL AND completed_at IS NOT NULL));
ALTER TABLE "phone_callback_events" ADD CONSTRAINT "phone_callback_events_kind_check" CHECK (kind IN ('CREATED', 'REASSIGNED', 'RESCHEDULED', 'ATTEMPTED', 'COMPLETED'));
