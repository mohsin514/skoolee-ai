-- SKAI-1886 (security): the Supabase anon key must not reach any app table.
--
-- On Supabase, the `anon` and `authenticated` roles get default grants on every table in `public`, and the
-- REST API (PostgREST) serves them to anyone holding the public anon/publishable key. With row-level
-- security off on almost every table, that exposed all schools' data. The app never uses those roles: it
-- connects as the table owner through Prisma. This revokes every privilege they hold in `public`, now and
-- for objects created later by this owner, and does nothing where the roles do not exist (plain Postgres,
-- CI, local).
--
-- Rollback: GRANT the privileges back (do not, unless a feature starts using the Supabase Data API, and then
-- only per table, behind row-level security).

DO $$
DECLARE r text; f record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', r);
    -- Only functions this role owns: extension functions (e.g. dblink) belong to the platform admin.
    FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', f.sig, r);
    END LOOP;
  END LOOP;
END $$;
