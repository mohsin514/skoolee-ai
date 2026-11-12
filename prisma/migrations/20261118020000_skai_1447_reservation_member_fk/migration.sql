-- SKAI-1447: reservations must reference a real library member.
-- NOT VALID keeps the migration backwards-compatible: new and updated rows are checked,
-- existing rows are left alone. Run VALIDATE CONSTRAINT in a later release after cleanup.
ALTER TABLE "book_reservations"
  ADD CONSTRAINT "book_reservations_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "library_members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
