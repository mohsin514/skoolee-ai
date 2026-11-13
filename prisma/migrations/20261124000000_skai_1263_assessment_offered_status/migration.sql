-- SKAI-1263: allow OFFERED (a time offered to the family to pick). Widens the check only; existing rows stay valid
-- and older code that never writes OFFERED keeps working.
ALTER TABLE "admission_assessments" DROP CONSTRAINT "admission_assessments_status_check";
ALTER TABLE "admission_assessments" ADD CONSTRAINT "admission_assessments_status_check" CHECK ("status" IN ('OFFERED', 'SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'));
