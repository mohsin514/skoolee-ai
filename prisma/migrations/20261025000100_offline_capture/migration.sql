-- CreateTable
CREATE TABLE "offline_operations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "operation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "base_status" TEXT,
    "base_version" INTEGER,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "server_value" JSONB,
    "message" TEXT,
    "attendance_id" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offline_operations_school_id_user_id_status_idx" ON "offline_operations"("school_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "offline_operations_school_id_status_created_at_idx" ON "offline_operations"("school_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "offline_operations_school_id_operation_id_key" ON "offline_operations"("school_id", "operation_id");

-- AddForeignKey
ALTER TABLE "offline_operations" ADD CONSTRAINT "offline_operations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-448: closed sets for what an offline operation can be and become.
ALTER TABLE "offline_operations" ADD CONSTRAINT "offline_operations_check" CHECK ("kind" IN ('ATTENDANCE_MARK') AND "status" IN ('ACCEPTED','CONFLICT','REJECTED_ACCESS','EXPIRED','RESOLVED_SERVER','RESOLVED_LOCAL','CORRECTION_REQUESTED','DISCARDED'));
