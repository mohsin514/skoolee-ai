-- SKO-414: an assignment may target a temporary lesson group; empty means the whole class.
ALTER TABLE "assignments" ADD COLUMN "audience_student_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
