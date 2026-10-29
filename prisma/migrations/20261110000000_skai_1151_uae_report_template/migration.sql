-- SKAI-1151: per-school UAE bilingual report-card template, off by default.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "uae_report_template" BOOLEAN NOT NULL DEFAULT false;
