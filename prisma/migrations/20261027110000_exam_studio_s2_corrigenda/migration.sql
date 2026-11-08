-- SKO-501: corrigenda recorded against a sealed paper. Additive only.

-- AlterTable
ALTER TABLE "exam_paper_slots" ADD COLUMN     "corrigenda" JSONB NOT NULL DEFAULT '[]';
