-- Acknowledging the welcome is separate from completing institution/profile setup.
ALTER TABLE "users" ADD COLUMN "welcome_completed_at" TIMESTAMP(3);
