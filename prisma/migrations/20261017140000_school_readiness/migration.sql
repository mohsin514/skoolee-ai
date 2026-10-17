-- CreateTable
CREATE TABLE "school_readiness" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "version" INTEGER NOT NULL DEFAULT 0,
    "rehearsal" JSONB NOT NULL DEFAULT '{}',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_tasks" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "readiness_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_readiness_school_id_key" ON "school_readiness"("school_id");

-- CreateIndex
CREATE INDEX "readiness_tasks_school_id_owner_id_status_idx" ON "readiness_tasks"("school_id", "owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_tasks_school_id_key_key" ON "readiness_tasks"("school_id", "key");

-- AddForeignKey
ALTER TABLE "school_readiness" ADD CONSTRAINT "school_readiness_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_tasks" ADD CONSTRAINT "readiness_tasks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-397 invariants.
ALTER TABLE "school_readiness" ADD CONSTRAINT "school_readiness_status" CHECK ("status" IN ('SETUP', 'READY'));
ALTER TABLE "school_readiness" ADD CONSTRAINT "school_readiness_approval_complete"
  CHECK ("status" <> 'READY' OR ("approved_by_id" IS NOT NULL AND "approved_at" IS NOT NULL AND "evidence" IS NOT NULL));
ALTER TABLE "readiness_tasks" ADD CONSTRAINT "readiness_task_status" CHECK ("status" IN ('OPEN', 'DONE', 'DEFERRED'));

-- A recorded go-live approval is evidence: it cannot be rewritten or withdrawn in place.
CREATE FUNCTION school_readiness_approval_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'READY' AND (NEW.status, NEW.approved_by_id, NEW.approved_at, NEW.evidence) IS DISTINCT FROM (OLD.status, OLD.approved_by_id, OLD.approved_at, OLD.evidence) THEN
    RAISE EXCEPTION 'A recorded readiness approval cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_readiness_approval_immutable BEFORE UPDATE ON "school_readiness"
  FOR EACH ROW EXECUTE FUNCTION school_readiness_approval_immutable();
