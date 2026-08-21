# Work Order — Wave 0 + Wave 1 (paste this to the QA agent)

**Reference spec:** `docs/qa/QA-MASTER-PLAN.md`. That document is the test *spec*.
This document is your *directive*: what to do now, what you are authorised to destroy, and where to stop.

---

## 1. Target — verify before you touch anything

The destructive work is authorised **only against the local Postgres instance**.

`.env` → `DATABASE_URL` / `DIRECT_URL` currently point at **localhost**. The live Supabase
credentials are parked in `.env.supabase-backup`.

**Hard gate — run this first, and abort the entire engagement if it does not print `SAFE`:**

```bash
grep -E "^(DATABASE_URL|DIRECT_URL)=" .env | grep -qvE "@(localhost|127\.0\.0\.1)[:/]" && echo "ABORT — non-local DB target" || echo "SAFE — local target confirmed"
```

**Prohibited without a fresh, explicit instruction from the user:**
- Repointing `DATABASE_URL`/`DIRECT_URL` at the Supabase host, or sourcing `.env.supabase-backup`.
- Any write, DDL, or reset against the Supabase project — including via `SUPABASE_SERVICE_ROLE_KEY`,
  which is present in `.env` and bypasses RLS. Treat that key as production-live.
- Running any of the root-level one-off scripts (`fix_*.py`, `rewrite_*.py`, `disable_stripe.py`,
  `fix_tenant_exec.py`, `repro-*.js`). They are unreviewed mutators. See FINDING-H.

Re-run the gate above at the start of every session. The target can drift between sessions.

---

## 2. Authorised destructive actions (local only)

Yes, you may destroy and rebuild the local database. That is the intended workflow.

**Take a restore point first — this is not optional:**

```bash
mkdir -p docs/qa/evidence && pg_dump "$(grep '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '\"')" > docs/qa/evidence/pre-qa-baseline.sql
```

Then you are cleared for:
- `npm run db:reset` (`prisma db push --force-reset --accept-data-loss`)
- `npm run db:seed`
- Arbitrary INSERT/UPDATE/DELETE while building the §1 fixture set
- Cross-tenant write attempts (§2 ISO-2.x) — these are *supposed* to try to corrupt data
- Injection payloads (§9 SEC-2, SEC-3, SEC-5) — including the FINDING-E probe below

Note: the last commit is "seeded data", so the local DB likely holds a working seed. The dump above
is what lets you put it back. Confirm the dump is non-empty before proceeding.

After `prisma generate` or any schema change: **restart the dev server** before testing. Stale client = false failures.

---

## 3. Scope for this wave

Deliver §1 (fixtures) and §2 (isolation) + §9 (security) from the master plan. Nothing else yet.

**§1 exit criteria — get this signed off before writing a single test case:**
- 6 tenants provisioned (T1–T6 per §1.1), collision data confirmed byte-identical across T1/T2
- 22+ personas logging in successfully, tokens captured
- `docs/qa/fixtures.json` committed
- The seed must be **deterministic and re-runnable** — it is Wave-0 deliverable #8, not a one-off

**§2 cannot be hand-run.** 179 routes × 22 personas is ~4,000 assertions. Build
`scripts/qa/isolation-sweep.mjs` (§2.2) first and let it generate the results. A manual sample is
not acceptable evidence for a release gate. Start from:

```bash
find src/app/api -name route.ts | sed 's|src/app/api||;s|/route.ts||' | sort > docs/qa/api-inventory.txt
```

---

## 4. Three findings to verify first — they may collapse large parts of §2

**FINDING-E (potential P0).** `src/lib/db/tenant.ts` builds DDL by raw interpolation:
`CREATE SCHEMA IF NOT EXISTS "${schemaName}"` via `$executeRawUnsafe`, plus 12 `CREATE TABLE`
statements. Trace `schemaName` to its source. If it derives from a user-supplied school name or slug,
this is SQL injection with DDL privileges — stop and report immediately, do not continue the sweep.
Probe locally with a school name of `evil"; CREATE TABLE public.pwned(x int);--`.

**FINDING-A (architectural).** Three isolation mechanisms coexist:
1. Row-level `school_id` on 93/96 Prisma models + the fail-closed app guard
2. Schema-per-tenant via `createTenantSchema()` — 12 tables per school
3. Postgres RLS in `prisma/rls.sql` — 689 lines, **verified correct but NOT enabled**

Establish which is actually live for which entity before testing isolation, or you will be testing
a code path no request ever reaches. Report the answer as a written rule.

**RLS status (read `prisma/rls.sql` header in full).** The policies were tested 2026-08-14 and
fail closed correctly, but are disabled behind two blockers — chiefly that the app connects as
`postgres`, which has `rolbypassrls = true`, so RLS is a complete no-op today. Do **not** enable it
as part of QA. Your job is to report whether the application guard alone is sufficient given RLS is
off, because right now it is the only thing standing between tenants.

---

## 5. Reporting

Use the format in §13 of the master plan. Additionally:
- Every §2 finding needs raw request + response saved under `docs/qa/evidence/`
- P0s are reported the moment they are found, not batched into a final report
- Do not mark anything PASS without the evidence artifact
- If the isolation sweep is green, say so plainly and show the assertion count

---

## 6. Stop and ask before

- Any action against the Supabase project
- Enabling RLS, creating DB roles, or repointing the connection string
- Modifying application source to make a test pass (report the defect; do not fix it in this wave)
- Committing or pushing anything beyond `docs/qa/**` and `scripts/qa/**`
