# QA Pilot Synthetic Data & Accounts (SKAI-999 / QA-01)

A one-command seed that creates **synthetic** QA tenants and per-role accounts on a
**local/dev** database for Sprint 2 verification. All data is fake (E1-FR-03): it
never counts as customer evidence.

## What it creates

- **Two synthetic GROUP schools** (tenants): `qa-alpha`, `qa-beta`, each with **two campuses**
  and `registrationKind = GROUP`.
  Accounts: owner (SUPER_ADMIN), admin (CAMPUS_ADMIN), principal, teacher, accountant,
  guardian (PARENT), student, **plus one no-access account** (unscoped) for denied-role tests.
- **One synthetic STANDALONE school** (SKAI-1066): `qa-solo`, one campus,
  `registrationKind = STANDALONE`, the same as a real "single school" signup
  (`src/lib/auth/register.ts`). Accounts: `admin@qa-solo.qa.local` (ADMIN, no campus,
  `isInstitutionOwner` + `canPurchaseSubscription` + `canManageMemberships`, as the
  registering owner has), plus principal, teacher, accountant, guardian, student and noaccess.
  There is no SUPER_ADMIN or CAMPUS_ADMIN in a standalone school.
  `/api/auth/session` for that admin reports `institution.kind = STANDALONE`,
  `isAuthority = true`, `standaloneOwner = true`, `isOwner = true`, so standalone-only
  settings (e.g. `PATCH /api/chat/settings`) can be tested.
  The tenant plan is in `scripts/qa/pilot-seed-plan.ts` and covered by
  `tests/pilots/qa-seed-plan.test.ts`.
- Names in **EN / UR / AR (RTL)**, including long and mixed-script samples.
- Synthetic phone numbers in the `+92-300` test range. Emails use the non-routable
  `*.qa.local` domain.

## Run it

```bash
pnpm run qa:seed            # seed / refresh (idempotent upsert)
pnpm run qa:seed -- --reset # drop the QA schools first, then reseed a clean state
```

## Credentials & safety (NFR-SEC-09 / G-01)

- Every account gets a **unique strong password** — there is **no shared demo password**.
- Passwords are written to `qa-credentials.json` (git-ignored, mode `600`) for transfer
  to the **team password manager**. **Move them there, then delete the file.** Never
  commit credentials or paste them into Jira, Confluence, Git or screenshots.
- The seed **fails closed** on internet-facing environments: it refuses to run when
  `APP_ENV`/`VERCEL_ENV`/`NODE_ENV` is production/staging/qa/preview, or when the DB
  host looks hosted (Supabase/RDS/…) unless `ALLOW_HOSTED_SEED=1` is set for a
  deliberate dev run. Nothing is ever seeded on production.

## QA checklist (acceptance)

1. Sign in as **every role** in **all three** schools on dev (including the standalone `qa-solo` admin).
2. Try a **cross-school URL** → access is denied.
3. Switch locale to **UR** and **AR (RTL)** and confirm names render.
4. Run `pnpm run qa:seed -- --reset` to restore a known state.

Source of truth: PRD v2.0 · QA-01 · E1-FR-03.
