-- CreateTable
CREATE TABLE "school_ai_executions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "record_version" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "preview_hash" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "receipt" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ai_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_ai_executions_school_id_campus_id_created_at_idx" ON "school_ai_executions"("school_id", "campus_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_executions_school_id_requested_by_id_idempotency__key" ON "school_ai_executions"("school_id", "requested_by_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "school_ai_executions_record_id_record_version_operation_key" ON "school_ai_executions"("record_id", "record_version", "operation");

-- AddForeignKey
ALTER TABLE "school_ai_executions" ADD CONSTRAINT "school_ai_executions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_executions" ADD CONSTRAINT "school_ai_executions_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ai_executions" ADD CONSTRAINT "school_ai_executions_record_id_school_id_fkey" FOREIGN KEY ("record_id", "school_id") REFERENCES "school_ai_records"("id", "school_id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "school_ai_executions"
  ADD CONSTRAINT "school_ai_executions_status_check" CHECK ("status" = 'COMPLETED'),
  ADD CONSTRAINT "school_ai_executions_version_check" CHECK ("record_version" > 0),
  ADD CONSTRAINT "school_ai_executions_operation_check" CHECK ("operation" = 'curriculum.import_topics');
