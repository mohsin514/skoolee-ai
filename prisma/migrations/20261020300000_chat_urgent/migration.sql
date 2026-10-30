-- SKO-415: staff can mark a chat message urgent so it notifies during quiet hours.
-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "is_urgent" BOOLEAN NOT NULL DEFAULT false;

