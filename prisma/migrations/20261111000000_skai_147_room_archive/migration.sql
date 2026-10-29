-- SKAI-147: archive rooms that are in use instead of deleting them. Additive and nullable.
ALTER TABLE "class_rooms" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
