-- SKO-391: durable, resumable institution setup state.
CREATE TABLE "institution_setups" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "institution_type" TEXT NOT NULL,
    "adoption_mode" TEXT,
    "current_step" TEXT NOT NULL DEFAULT 'structure',
    "completed_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "draft" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "failed_step" TEXT,
    "last_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "delegate_user_id" TEXT,
    "delegated_by_id" TEXT,
    "delegated_at" TIMESTAMP(3),
    "updated_by_id" TEXT,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_setups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institution_setups_school_id_key" ON "institution_setups"("school_id");

ALTER TABLE "institution_setups" ADD CONSTRAINT "institution_setups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
