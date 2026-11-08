-- SKO-464: postal items tracked to a handoff (status, accountable owner, courier, handed-to, item code, retry key, version) with durable event history including corrections.
-- AlterTable
ALTER TABLE "postal_records" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "courier" TEXT,
ADD COLUMN     "handed_to" TEXT,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "item_code" TEXT,
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "recorded_by_id" TEXT,
ADD COLUMN     "request_hash" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "postal_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "postal_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "owner_id" TEXT,
    "changes" JSONB,
    "note" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "postal_events_postal_id_created_at_idx" ON "postal_events"("postal_id", "created_at");

-- CreateIndex
CREATE INDEX "postal_events_school_id_idx" ON "postal_events"("school_id");

-- CreateIndex
CREATE INDEX "postal_records_campus_id_status_idx" ON "postal_records"("campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "postal_records_campus_id_item_code_key" ON "postal_records"("campus_id", "item_code");

-- CreateIndex
CREATE UNIQUE INDEX "postal_records_campus_id_idempotency_key_key" ON "postal_records"("campus_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "postal_records" ADD CONSTRAINT "postal_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postal_events" ADD CONSTRAINT "postal_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postal_events" ADD CONSTRAINT "postal_events_postal_id_fkey" FOREIGN KEY ("postal_id") REFERENCES "postal_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Legacy rows predate handoff tracking: whether they were collected or delivered is unknown, so incoming
-- items open as RECEIVED and outgoing as PREPARED for reception to close with a real handoff.
UPDATE "postal_records" SET direction = 'RECEIVE' WHERE direction NOT IN ('RECEIVE', 'DISPATCH');
UPDATE "postal_records" SET status = CASE WHEN direction = 'DISPATCH' THEN 'PREPARED' ELSE 'RECEIVED' END;
UPDATE "postal_records" SET item_code = 'PST-' || upper(substr(replace(id, '-', ''), 1, 8)) WHERE item_code IS NULL;
INSERT INTO "postal_events" (id, school_id, campus_id, postal_id, kind, to_status, changes, actor_id, created_at)
SELECT gen_random_uuid()::text, school_id, campus_id, id, 'CREATED', status,
       jsonb_build_object('fromName', from_name, 'toName', to_name, 'referenceNo', reference_no, 'courier', courier, 'note', note),
       'system', created_at FROM "postal_records";
ALTER TABLE "postal_records" ADD CONSTRAINT "postal_records_direction_check" CHECK (direction IN ('RECEIVE', 'DISPATCH'));
ALTER TABLE "postal_records" ADD CONSTRAINT "postal_records_status_check" CHECK (
  (direction = 'RECEIVE' AND status IN ('RECEIVED', 'ASSIGNED', 'COLLECTED')) OR
  (direction = 'DISPATCH' AND status IN ('PREPARED', 'DISPATCHED', 'DELIVERED')));
ALTER TABLE "postal_records" ADD CONSTRAINT "postal_records_handoff_check" CHECK (status NOT IN ('COLLECTED', 'DELIVERED') OR (handed_to IS NOT NULL AND closed_at IS NOT NULL));
ALTER TABLE "postal_events" ADD CONSTRAINT "postal_events_kind_check" CHECK (kind IN ('CREATED', 'ASSIGNED', 'DISPATCHED', 'COLLECTED', 'DELIVERED', 'CORRECTED'));
