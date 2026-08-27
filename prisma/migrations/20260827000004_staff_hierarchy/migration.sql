-- Staff hierarchy (Module 8b): rank ladder, unit tree, reporting lines
-- and the appointment history that records every position change.
--
-- Safe on a database that already received these objects via
-- `prisma db push`: every statement is guarded.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StaffTrack" AS ENUM ('LEADERSHIP', 'ACADEMIC', 'ADMINISTRATIVE', 'SUPPORT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DepartmentKind" AS ENUM ('FACULTY', 'SCHOOL', 'DEPARTMENT', 'SECTION', 'ADMIN_UNIT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DepartmentRole" AS ENUM ('HEAD', 'DEPUTY_HEAD', 'COORDINATOR', 'MEMBER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StaffEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'VISITING', 'ADJUNCT', 'CONTRACT', 'INTERN', 'VOLUNTEER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StaffEmploymentStatus" AS ENUM ('PROBATION', 'ACTIVE', 'ON_LEAVE', 'SECONDED', 'SUSPENDED', 'NOTICE_PERIOD', 'RESIGNED', 'RETIRED', 'TERMINATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StaffChangeKind" AS ENUM ('JOINED', 'CONFIRMED', 'PROMOTION', 'DEMOTION', 'LATERAL_MOVE', 'DEPARTMENT_TRANSFER', 'CAMPUS_TRANSFER', 'REPORTING_CHANGE', 'ACTING_ASSIGNMENT', 'ACTING_ENDED', 'CONTRACT_RENEWAL', 'SUSPENDED', 'REINSTATED', 'RESIGNED', 'RETIRED', 'TERMINATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ReportingLineKind" AS ENUM ('DOTTED', 'FUNCTIONAL', 'PROJECT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS     "institution_type" TEXT NOT NULL DEFAULT 'SCHOOL';

-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS     "contract_ends_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "designation_id" TEXT,
ADD COLUMN IF NOT EXISTS     "employee_code" TEXT,
ADD COLUMN IF NOT EXISTS     "employment_status" "StaffEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS     "employment_type" "StaffEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN IF NOT EXISTS     "primary_department_id" TEXT,
ADD COLUMN IF NOT EXISTS     "probation_ends_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "rank_since" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "reports_to_id" TEXT,
ADD COLUMN IF NOT EXISTS     "seniority_level" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_designations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "level" INTEGER NOT NULL,
    "track" "StaffTrack" NOT NULL DEFAULT 'ACADEMIC',
    "can_head_department" BOOLEAN NOT NULL DEFAULT false,
    "is_institution_head" BOOLEAN NOT NULL DEFAULT false,
    "promotes_to_id" TEXT,
    "min_years_in_rank" INTEGER,
    "color_token" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "departments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "campus_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" "DepartmentKind" NOT NULL DEFAULT 'DEPARTMENT',
    "head_id" TEXT,
    "description" TEXT,
    "color_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "department_members" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "department_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "DepartmentRole" NOT NULL DEFAULT 'MEMBER',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_acting" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_appointments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT NOT NULL,
    "change_kind" "StaffChangeKind" NOT NULL,
    "designation_id" TEXT,
    "department_id" TEXT,
    "reports_to_id" TEXT,
    "designation_name" TEXT,
    "department_name" TEXT,
    "reports_to_name" TEXT,
    "level" INTEGER,
    "employment_type" "StaffEmploymentType",
    "employment_status" "StaffEmploymentStatus",
    "basic_salary" INTEGER,
    "is_acting" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "order_ref" TEXT,
    "notes" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_appointments_pkey" PRIMARY KEY ("id")
);

-- A database that received this table through `prisma db push` BEFORE
-- StaffAppointment.orderRef gained its @map("order_ref") has the column under
-- the camelCase name. Rename rather than drop-and-add so nothing is lost on a
-- table that already holds appointments.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'staff_appointments' AND column_name = 'orderRef'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'staff_appointments' AND column_name = 'order_ref'
    ) THEN
        ALTER TABLE "staff_appointments" RENAME COLUMN "orderRef" TO "order_ref";
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_reporting_lines" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL DEFAULT '',
    "user_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "kind" "ReportingLineKind" NOT NULL DEFAULT 'DOTTED',
    "label" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_reporting_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_designations_school_id_level_idx" ON "staff_designations"("school_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "staff_designations_school_id_name_key" ON "staff_designations"("school_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "departments_school_id_idx" ON "departments"("school_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "departments_campus_id_parent_id_idx" ON "departments"("campus_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "departments_campus_id_name_key" ON "departments"("campus_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "department_members_department_id_ended_at_idx" ON "department_members"("department_id", "ended_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "department_members_user_id_ended_at_idx" ON "department_members"("user_id", "ended_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "department_members_school_id_idx" ON "department_members"("school_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_appointments_user_id_effective_from_idx" ON "staff_appointments"("user_id", "effective_from");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_appointments_user_id_effective_to_idx" ON "staff_appointments"("user_id", "effective_to");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_appointments_school_id_idx" ON "staff_appointments"("school_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_reporting_lines_user_id_ended_at_idx" ON "staff_reporting_lines"("user_id", "ended_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_reporting_lines_manager_id_ended_at_idx" ON "staff_reporting_lines"("manager_id", "ended_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_reporting_lines_school_id_idx" ON "staff_reporting_lines"("school_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_profiles_school_id_seniority_level_idx" ON "staff_profiles"("school_id", "seniority_level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_profiles_reports_to_id_idx" ON "staff_profiles"("reports_to_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_profiles_primary_department_id_idx" ON "staff_profiles"("primary_department_id");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "staff_designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_primary_department_id_fkey" FOREIGN KEY ("primary_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_designations" ADD CONSTRAINT "staff_designations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_designations" ADD CONSTRAINT "staff_designations_promotes_to_id_fkey" FOREIGN KEY ("promotes_to_id") REFERENCES "staff_designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "department_members" ADD CONSTRAINT "department_members_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "department_members" ADD CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "department_members" ADD CONSTRAINT "department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_appointments" ADD CONSTRAINT "staff_appointments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_appointments" ADD CONSTRAINT "staff_appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_appointments" ADD CONSTRAINT "staff_appointments_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "staff_designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_appointments" ADD CONSTRAINT "staff_appointments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_appointments" ADD CONSTRAINT "staff_appointments_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_appointments" ADD CONSTRAINT "staff_appointments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_reporting_lines" ADD CONSTRAINT "staff_reporting_lines_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_reporting_lines" ADD CONSTRAINT "staff_reporting_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "staff_reporting_lines" ADD CONSTRAINT "staff_reporting_lines_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

