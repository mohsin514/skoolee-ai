-- SKAI-1396: one student document per file key, enforced by the database.
-- Additive and backwards-compatible. If duplicate (student_id, file_key) rows already exist,
-- this index cannot be created: remove the duplicates (keeping the earliest) in a separate, reviewed step first.
CREATE UNIQUE INDEX "student_documents_student_id_file_key_key" ON "student_documents"("student_id", "file_key");
