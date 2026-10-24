-- SKO-399: contracted teaching capacity (unknown stays NULL).
-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "contracted_periods_per_week" INTEGER;

ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_capacity_check" CHECK (contracted_periods_per_week IS NULL OR contracted_periods_per_week BETWEEN 0 AND 80);
