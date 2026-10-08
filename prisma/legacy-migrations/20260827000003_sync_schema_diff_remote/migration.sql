-- Sync schema differences found between local and remote.
-- These columns existed locally (via prisma db push) but were never
-- applied to the remote Supabase database.
--
-- The `schools.institution_type` and `staff_profiles.*` statements that used to
-- live here have moved to 20260827000004_staff_hierarchy. They referenced the
-- "StaffEmploymentStatus" / "StaffEmploymentType" enums, which nothing had
-- created yet — and because this migration sorts FIRST, it failed on any
-- database that had not already been `db push`ed:
--
--     ERROR: type "StaffEmploymentStatus" does not exist
--
-- That migration creates the enums before the columns that use them, and its
-- statements are guarded, so moving them there fixes the ordering without
-- changing the end state.

-- users: align subject_specialties with what Prisma generates for a scalar
-- list — nullable, defaulting to an empty array.
ALTER TABLE "users" ALTER COLUMN "subject_specialties" SET DEFAULT '{}';
ALTER TABLE "users" ALTER COLUMN "subject_specialties" DROP NOT NULL;
