-- SKAI-1856: the librarian console counts loans per month by school and issue date, and the group console
-- reads each pupil's latest report card by school, pupil and generation time. Additive indexes only.
CREATE INDEX IF NOT EXISTS "book_issues_school_id_issued_at_idx" ON "book_issues"("school_id", "issued_at");

CREATE INDEX IF NOT EXISTS "report_cards_school_id_student_id_generated_at_idx" ON "report_cards"("school_id", "student_id", "generated_at");
