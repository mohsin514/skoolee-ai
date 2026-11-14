-- SKAI-1969: the admissions funnel reads one calendar year of enquiries and applications per campus.
CREATE INDEX IF NOT EXISTS "admission_queries_campus_id_created_at_idx" ON "admission_queries"("campus_id", "created_at");
CREATE INDEX IF NOT EXISTS "admission_applications_campus_id_created_at_idx" ON "admission_applications"("campus_id", "created_at");
