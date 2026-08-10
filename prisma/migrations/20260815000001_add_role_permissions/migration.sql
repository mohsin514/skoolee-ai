-- Module 11 — Roles & Permissions Matrix
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- Each ADD VALUE is therefore a separate statement (Prisma runs these
-- without a wrapping transaction).

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LIBRARIAN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RECEPTIONIST';

CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "module" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_add" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_permissions_school_id_role_module_key" ON "role_permissions"("school_id", "role", "module");
CREATE INDEX "role_permissions_role_module_idx" ON "role_permissions"("role", "module");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
