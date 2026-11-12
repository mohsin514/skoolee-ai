-- SKAI-1847: phone-to-computer upload handoff (Skoolee Drop). New tables only; nothing existing changes.
-- Rollback: DROP TABLE drop_items; DROP TABLE drop_sessions; (staged objects under drop/ are purged by the cron).

-- CreateTable
CREATE TABLE "drop_sessions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accept" TEXT[],
    "max_files" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drop_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_items" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drop_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drop_sessions_school_id_created_by_id_idx" ON "drop_sessions"("school_id", "created_by_id");

-- CreateIndex
CREATE INDEX "drop_sessions_expires_at_idx" ON "drop_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "drop_items_storage_key_key" ON "drop_items"("storage_key");

-- CreateIndex
CREATE INDEX "drop_items_school_id_idx" ON "drop_items"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "drop_items_session_id_sha256_key" ON "drop_items"("session_id", "sha256");

-- AddForeignKey
ALTER TABLE "drop_sessions" ADD CONSTRAINT "drop_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_items" ADD CONSTRAINT "drop_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "drop_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

