-- SKAI-1478: durable cleanup tombstones for private objects whose metadata was deleted. Additive.
CREATE TABLE "storage_cleanups" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "receipt_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "storage_cleanups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "storage_cleanups_object_key_key" ON "storage_cleanups"("object_key");
CREATE INDEX "storage_cleanups_school_id_status_idx" ON "storage_cleanups"("school_id", "status");
CREATE INDEX "storage_cleanups_receipt_id_idx" ON "storage_cleanups"("receipt_id");
