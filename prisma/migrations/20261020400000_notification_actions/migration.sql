-- SKO-416: notification categories, source identity, dedupe and source-driven resolution.
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'UPDATE',
ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "due_at" TIMESTAMP(3),
ADD COLUMN     "last_reminded_at" TIMESTAMP(3),
ADD COLUMN     "reminder_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "source_type" TEXT;

-- CreateIndex
CREATE INDEX "notifications_user_id_category_resolved_at_idx" ON "notifications"("user_id", "category", "resolved_at");

-- CreateIndex
CREATE INDEX "notifications_source_type_source_id_idx" ON "notifications"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");


ALTER TABLE "notifications" ADD CONSTRAINT "notifications_category_check" CHECK (category IN ('UPDATE','MENTION','ACTION'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resolution_check" CHECK (resolution IS NULL OR resolution IN ('COMPLETED','CANCELLED','REASSIGNED'));
-- Existing chat notifications are mentions; existing leave requests become updates (their source id was never stored).
UPDATE "notifications" SET category = 'MENTION', source_type = 'chat', source_id = substring(link from 'c=([0-9a-fA-F-]+)') WHERE type = 'CHAT_MESSAGE' AND link LIKE '/messages?c=%';
