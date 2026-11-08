-- CreateTable
CREATE TABLE "study_passages" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "resource_id" TEXT NOT NULL,
    "resource_version" INTEGER NOT NULL,
    "class_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_turns" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "answer" JSONB NOT NULL DEFAULT '{}',
    "citation_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engine" TEXT NOT NULL,
    "prompt_version" TEXT,
    "reported_at" TIMESTAMP(3),
    "report_reason" TEXT,
    "help_requested_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_passages_school_id_class_id_idx" ON "study_passages"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "study_passages_school_id_resource_id_resource_version_idx" ON "study_passages"("school_id", "resource_id", "resource_version");

-- CreateIndex
CREATE INDEX "study_turns_school_id_student_id_created_at_idx" ON "study_turns"("school_id", "student_id", "created_at");

-- CreateIndex
CREATE INDEX "study_turns_school_id_class_id_idx" ON "study_turns"("school_id", "class_id");

-- AddForeignKey
ALTER TABLE "study_passages" ADD CONSTRAINT "study_passages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_turns" ADD CONSTRAINT "study_turns_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SKO-428: closed outcome set; passages carry real text and a section label.
ALTER TABLE "study_turns" ADD CONSTRAINT "study_turns_outcome_check" CHECK ("outcome" IN ('ANSWERED','UNSUPPORTED','BLOCKED','UNAVAILABLE','REFUSED') AND length("question") > 0);
ALTER TABLE "study_passages" ADD CONSTRAINT "study_passages_shape_check" CHECK (length(btrim("text")) >= 20 AND length(btrim("section")) > 0 AND "resource_version" > 0);
