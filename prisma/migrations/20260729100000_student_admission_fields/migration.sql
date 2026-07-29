-- Student Admission & Onboarding: new fields for the 4-step admission form
ALTER TABLE "students" ADD COLUMN "name_ur" TEXT;
ALTER TABLE "students" ADD COLUMN "blood_type" TEXT;
ALTER TABLE "students" ADD COLUMN "nationality" TEXT DEFAULT 'Pakistan';
ALTER TABLE "students" ADD COLUMN "guardian_name_ur" TEXT;
ALTER TABLE "students" ADD COLUMN "guardian_relationship" TEXT;
ALTER TABLE "students" ADD COLUMN "guardian_occupation" TEXT;
ALTER TABLE "students" ADD COLUMN "city" TEXT;
ALTER TABLE "students" ADD COLUMN "province" TEXT;
ALTER TABLE "students" ADD COLUMN "postal_code" TEXT;
ALTER TABLE "students" ADD COLUMN "medical_notes" TEXT;
ALTER TABLE "students" ADD COLUMN "special_needs" TEXT;
ALTER TABLE "students" ADD COLUMN "allergies" TEXT;
ALTER TABLE "students" ADD COLUMN "medications" TEXT;
ALTER TABLE "students" ADD COLUMN "previous_school" TEXT;
ALTER TABLE "students" ADD COLUMN "enrollment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "students" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
