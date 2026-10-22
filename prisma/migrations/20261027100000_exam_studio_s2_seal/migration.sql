-- SKO-501 (Exam Studio slice 2): moderation decisions and the Seal. Additive only.

-- AlterTable
ALTER TABLE "exam_paper_slots" ADD COLUMN "seal_hash" TEXT,
ADD COLUMN "sealed_by_id" TEXT,
ADD COLUMN "seal_reason" TEXT,
ADD COLUMN "compromised_at" TIMESTAMP(3),
ADD COLUMN "compromise_reason" TEXT;

-- CreateTable
CREATE TABLE "exam_paper_moderations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "paper_record_id" TEXT NOT NULL,
    "paper_version" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comments" JSONB NOT NULL DEFAULT '[]',
    "conformance" JSONB NOT NULL DEFAULT '[]',
    "moderator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_paper_moderations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_paper_moderations_school_id_campus_id_slot_id_created__idx" ON "exam_paper_moderations"("school_id", "campus_id", "slot_id", "created_at");

-- AddForeignKey
ALTER TABLE "exam_paper_moderations" ADD CONSTRAINT "exam_paper_moderations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "exam_paper_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
