-- SKAI-850: read-only verification of database row-level security.
-- Run as the APPLICATION role (never postgres/owner), against the deployed env:
--   psql "$APP_ROLE_URL" -v ON_ERROR_STOP=1 \
--        -v school_a="'<qa-school-a-id>'" -v school_b="'<qa-school-b-id>'" \
--        -f scripts/ops/verify-rls.sql
-- Everything runs inside a transaction that is rolled back. Nothing is written.
-- Use synthetic QA schools only (QA-01). Paste the output, not credentials.

BEGIN READ ONLY;

\echo '== 1. Connecting role must be non-owner, non-superuser, non-BYPASSRLS'
SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
       (r.rolsuper OR r.rolbypassrls) AS fail
FROM pg_roles r WHERE r.rolname = current_user;

\echo '== 2. Tenant tables (have school_id) without RLS enabled+forced (expect 0 rows)'
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN information_schema.columns col
  ON col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'school_id'
WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
ORDER BY 1;

\echo '== 3. Tenant tables owned by the connecting role (expect 0 rows; owners bypass non-forced RLS)'
SELECT c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r' AND pg_get_userbyid(c.relowner) = current_user
ORDER BY 1;

\echo '== 4. Tenant tables with no tenant_isolation policy (expect 0 rows)'
SELECT col.table_name FROM information_schema.columns col
WHERE col.table_schema = 'public' AND col.column_name = 'school_id'
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = col.table_name
                    AND p.policyname = 'tenant_isolation')
ORDER BY 1;

\echo '== 5. Fail-closed probe: GUC unset must see 0 students'
SELECT set_config('app.current_school_id', '', true);
SELECT count(*) AS students_visible_without_school FROM students;

\echo '== 6. School A scope: rows from any other school must be 0'
SELECT set_config('app.current_school_id', :school_a, true);
SELECT count(*) AS own_rows, count(*) FILTER (WHERE school_id <> :school_a) AS foreign_rows FROM students;

\echo '== 7. School B scope: rows from any other school must be 0'
SELECT set_config('app.current_school_id', :school_b, true);
SELECT count(*) AS own_rows, count(*) FILTER (WHERE school_id <> :school_b) AS foreign_rows FROM students;

ROLLBACK;
