-- A missed paper is not a zero.
--
-- Absence was written as marksObtained = 0, which marked the absentee failed
-- and pulled every average down by a paper nobody sat. The flag records the
-- fact; marksObtained stays 0 so readers that only understand a number keep
-- working.
ALTER TABLE "marks" ADD COLUMN IF NOT EXISTS "is_absent" BOOLEAN NOT NULL DEFAULT false;
