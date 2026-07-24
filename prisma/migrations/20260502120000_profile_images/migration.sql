ALTER TABLE IF EXISTS "users"
  ADD COLUMN IF NOT EXISTS "profile_image_url" TEXT;

ALTER TABLE IF EXISTS "students"
  ADD COLUMN IF NOT EXISTS "profile_image_url" TEXT;
