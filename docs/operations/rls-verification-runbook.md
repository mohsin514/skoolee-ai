# Row-level security verification (SKAI-850, NFR-SEC-01)

The application tenant guard (`src/lib/db/prisma.ts`, fail-closed) is always on.
Database RLS (`prisma/rls.sql`) is the second layer. It only works when the app
connects as a role that is **not** the table owner, not a superuser and has
`rolbypassrls = false`. This needs ops database access, so it is a human step.

## Who and where

- An ops owner with Supabase admin access, on the **dev** project first.
- Use the synthetic QA schools (QA-01) only. Never paste passwords or real data.

## Steps (dev)

1. As the owner, create the app role (choose the password yourself, store it in
   the secret manager only) as described in the `BLOCKER 1` header of
   `prisma/rls.sql`. Confirm `rolbypassrls = false`.
2. Set `TENANT_RLS=on` for the dev deployment, deploy, smoke-test sign-in and
   one page per role.
3. Repoint `DATABASE_URL` (pooled) at the app role. Keep `DIRECT_URL` on the
   owner for migrations.
4. As the owner, apply `prisma/rls.sql`.
5. As the **app role**, run the read-only check:
   `psql "$APP_ROLE_URL" -v ON_ERROR_STOP=1 -v school_a="'<id>'" -v school_b="'<id>'" -f scripts/ops/verify-rls.sql`
6. Pass when: step 1 `fail = f`; steps 2, 3, 4 return no rows; step 5 shows 0;
   steps 6 and 7 show `foreign_rows = 0` and `own_rows > 0`.
7. Run a two-school UI pass (QA-01 school A
   and B, plus a denied role) against dev.

## Rollback

`TENANT_RLS=off`, repoint `DATABASE_URL` back to the owner, and if needed
`ALTER TABLE … DISABLE ROW LEVEL SECURITY` per table. No data changes.

## Evidence for QA

Attach the `verify-rls.sql` output (`SKAI-850_measure.png` or `.txt`) with
date, environment, commit and role name, plus the QA comment line from the
ticket. Repeat on production for L4.
