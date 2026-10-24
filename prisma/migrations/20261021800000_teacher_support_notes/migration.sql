-- SKO-461: append-only support actions and teacher responses beside teaching evidence.
CREATE TABLE "teacher_support_notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teacher_support_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teacher_support_notes_kind" CHECK ("kind" IN ('SUPPORT_ACTION', 'TEACHER_RESPONSE'))
);
CREATE INDEX "teacher_support_notes_teacher_id_academic_year_idx" ON "teacher_support_notes"("teacher_id", "academic_year");
CREATE INDEX "teacher_support_notes_school_id_idx" ON "teacher_support_notes"("school_id");
