-- SKAI-1157: append-only guardian consent records per student (SKAI-1105 §3.1).
-- Additive only: a new table; no existing table or column changes.

-- CreateTable
CREATE TABLE "guardian_consents" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "guardian_user_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "guardian_name" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "notice_version" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "receipt_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consents_receipt_code_key" ON "guardian_consents"("receipt_code");

-- CreateIndex
CREATE INDEX "guardian_consents_school_id_campus_id_student_id_created_at_idx" ON "guardian_consents"("school_id", "campus_id", "student_id", "created_at");

-- CreateIndex
CREATE INDEX "guardian_consents_school_id_guardian_user_id_student_id_cre_idx" ON "guardian_consents"("school_id", "guardian_user_id", "student_id", "created_at");

-- AddForeignKey
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_guardian_user_id_fkey" FOREIGN KEY ("guardian_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_language_check" CHECK ("language" IN ('en', 'ar', 'ur'));
