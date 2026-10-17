-- SKO-467: complaint cases with owner, due date, confidential routing, receipt code, retry key and durable event history.
-- AlterTable
ALTER TABLE "complaints" ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "due_date" DATE,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "public_response" TEXT,
ADD COLUMN     "received_by_id" TEXT,
ADD COLUMN     "reference_code" TEXT,
ADD COLUMN     "reopened_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "request_hash" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "complaint_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "note" TEXT,
    "owner_id" TEXT,
    "due_date" DATE,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaint_events_complaint_id_created_at_idx" ON "complaint_events"("complaint_id", "created_at");

-- CreateIndex
CREATE INDEX "complaint_events_school_id_idx" ON "complaint_events"("school_id");

-- CreateIndex
CREATE INDEX "complaints_campus_id_status_idx" ON "complaints"("campus_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_campus_id_reference_code_key" ON "complaints"("campus_id", "reference_code");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_campus_id_idempotency_key_key" ON "complaints"("campus_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Legacy statuses map onto the case lifecycle; every existing complaint gets a receipt code and a CREATED event.
UPDATE "complaints" SET status = 'RESOLVED', resolved_at = COALESCE(resolved_at, created_at), resolution = COALESCE(resolution, action_taken, 'Resolved before case tracking') WHERE status IN ('RESOLVED','CLOSED');
UPDATE "complaints" SET status = 'OPEN' WHERE status NOT IN ('OPEN','IN_PROGRESS','RESOLVED');
UPDATE "complaints" SET reference_code = 'CMP-' || upper(substr(replace(id, '-', ''), 1, 8)) WHERE reference_code IS NULL;
INSERT INTO "complaint_events" (id, school_id, campus_id, complaint_id, kind, to_status, actor_id, created_at)
SELECT gen_random_uuid()::text, school_id, campus_id, id, 'CREATED', status, 'system', created_at FROM "complaints";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_status_check" CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED'));
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resolution_check" CHECK (status <> 'RESOLVED' OR (resolution IS NOT NULL AND resolved_at IS NOT NULL));
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_kind_check" CHECK (kind IN ('CREATED','ASSIGNED','NOTE','STATUS','RESOLVED','REOPENED'));
