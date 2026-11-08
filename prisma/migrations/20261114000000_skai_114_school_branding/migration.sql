-- SKAI-114: school identity and branding. Additive, nullable columns only.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "name_ur" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "name_ar" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "short_name" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "brand_color" TEXT;
