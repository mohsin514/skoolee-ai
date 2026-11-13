-- SKAI-1847: drop_items carries school_id but had no foreign key to schools (SKAI-1807 requires one on every schoolId table).
-- Backwards-compatible: drop items are always written with their session's school, so existing rows already satisfy the key.
-- Rollback: ALTER TABLE "drop_items" DROP CONSTRAINT "drop_items_school_id_fkey";
ALTER TABLE "drop_items" ADD CONSTRAINT "drop_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
