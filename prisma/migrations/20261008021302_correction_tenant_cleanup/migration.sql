-- Whole-school deletion cascades across several siblings. Check references at
-- transaction end, after all cascades finish. Append-only triggers still reject
-- record deletion while the owning school exists.
ALTER TABLE payment_allocations ALTER CONSTRAINT allocation_invoice_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE corrections ALTER CONSTRAINT correction_campus_fk DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE corrections ALTER CONSTRAINT correction_student_fk DEFERRABLE INITIALLY DEFERRED;
