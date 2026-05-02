ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "profile_image_url" TEXT;

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "profile_image_url" TEXT;
