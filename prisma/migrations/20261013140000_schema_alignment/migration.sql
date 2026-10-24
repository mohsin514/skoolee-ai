-- Active-identity uniqueness remains in its existing partial indexes.
-- These non-unique lookup indexes also cover preserved archived identities.
CREATE INDEX IF NOT EXISTS "students_school_id_admission_no_idx" ON "students"("school_id", "admission_no");
CREATE INDEX IF NOT EXISTS "students_campus_id_roll_no_idx" ON "students"("campus_id", "roll_no");

-- Reconcile both versioned-migration and historical schema-push index names.
-- Renaming an index preserves its contents and uniqueness contract.
DO $alignment$
DECLARE names RECORD;
BEGIN
  FOR names IN SELECT * FROM (VALUES
    ('import_batches_school_campus_created_idx', 'import_batches_school_id_campus_id_created_at_idx'),
    ('import_batches_school_campus_kind_fingerprint_scope_key', 'import_batches_school_id_campus_id_kind_fingerprint_target__key'),
    ('import_batches_school_expires_idx', 'import_batches_school_id_expires_at_idx'),
    ('onboarding_checkout_intents_school_id_user_id_idempotency_key_k', 'onboarding_checkout_intents_school_id_user_id_idempotency_k_key')
  ) AS pair(old_name, new_name) LOOP
    IF to_regclass(format('public.%I', names.new_name)) IS NULL THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', names.old_name, names.new_name);
    END IF;
  END LOOP;
END
$alignment$;
