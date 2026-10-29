# Environments

The deployment design defines five environments. Each must have its **own Vercel
project** and **own Supabase database**. The names below are intended configuration,
not evidence that the projects exist or that isolation has been verified. Confirm
the actual provider settings and environment-specific credentials before use.

| Environment | Git branch  | Vercel project       | Supabase project | Purpose                 |
|-------------|-------------|----------------------|------------------|-------------------------|
| Development | `dev`       | `skoolee-ai-dev`     | `skoolee-dev`    | Active feature work     |
| Staging     | `staging`   | `skoolee-ai-staging` | `skoolee-staging`| Pre-release integration |
| QA          | `qa`        | `skoolee-ai-qa`      | `skoolee-qa`     | Test/validation passes  |
| Production  | `production`| `skoolee-ai-prod`    | `skoolee-prod`   | Live traffic            |
| Demo        | `demo`      | `skoolee-ai-demo`    | `skoolee-demo`   | Sales / showcase        |

> **`qa` branch** — the old `qa/wave1-isolation-auth-a11y` branch (fully merged
> into `main`) was deleted so the QA environment branch can be named simply `qa`.

> **Note on `main`** — the pre-existing Vercel project is linked to `main`. Leave
> that project as-is; the five projects above are additional. If you prefer, point
> the existing project's Production branch at `production` and treat `main` as an
> integration trunk.

## Database isolation (one Supabase project per env)

Every environment points at its **own** Supabase project. Nothing is shared:

- `dev` mistakes never touch `production` data.
- `db:reset` / `db:seed` run against an env's own DB only.
- Schema changes propagate through the deploy pipeline (migrations run per env),
  not by mutating one shared instance.

**Provisioning:** run `scripts/provision-supabase-envs.sh` (dashboard runbook by
default; scripted via the Supabase Management API when `SUPABASE_ACCESS_TOKEN` is
set). Create five projects — `skoolee-dev`, `skoolee-staging`, `skoolee-qa`,
`skoolee-prod`, `skoolee-demo` — all in the same region.

For each project, collect:

| Value                          | Where it goes                                   |
|--------------------------------|-------------------------------------------------|
| Pooler URI (port 6543)         | `DATABASE_URL` (runtime) — append `?pgbouncer=true&connection_limit=1` (SKAI-1038; the app adds them if missing) |
| Direct URI (port 5432)         | `DIRECT_URL` (migrations)                         |
| Project URL / anon / service   | `NEXT_PUBLIC_SUPABASE_URL` + keys                |

...and put them in BOTH the GitHub Environment secrets and the Vercel project.

Empty databases provision from the verified versioned baseline using `prisma migrate
deploy`. Existing schema-push databases must complete the reviewed adoption process
in [the recovery runbook](recovery/RUNBOOK.md) first. The archived legacy baseline
was not executable SQL; do not attempt to replay it or reset an existing environment.

## Environment variables

Each environment has an example file in the repo root:

- `.env.dev.example`
- `.env.staging.example`
- `.env.qa.example`
- `.env.production.example`
- `.env.demo.example`

These contain **placeholders only** — no secrets are committed. Real values live
in each Vercel project's Environment Variables (and the GitHub Environment secrets
for CI migrations), and locally in `.env` (gitignored).

Because each environment has its own Supabase project, the DB URLs and Supabase
keys **differ per environment** — copy each env's values from its own Supabase
project. `NEXT_PUBLIC_APP_URL` also differs (each Vercel project has its own URL).
Use a distinct `AUTH_SECRET`, queue, object-store namespace and environment-scoped
provider credentials. Synthetic recovery uses no live provider credentials and
starts no app or worker. An application staging smoke run must explicitly disable
outbound delivery (`EMAIL_DEV_MODE=true`, `DISABLE_OUTBOUND_MESSAGES=true`) and use
approved sandbox/sink integrations; those flags alone are not a network-egress
boundary. Never copy a generic local `.env` or `.env.supabase-backup` into staging.

## Development deployment

Push or merge into `dev` to deploy through the existing Vercel Git integration.
`vercel.json` enables Git deployment for `dev` only; all other branches retain
controlled deployment. No GitHub Vercel CLI secrets or per-release approval
variables are needed for development. The `skoolee-ai-dev` project must remain
connected to this repository with Production Branch `dev` and its existing runtime
variables. If Git integration was disabled in the dashboard, re-enable it for that
project. A manual GitHub workflow rerun only verifies; to deploy an already merged
commit, use Vercel's deployment UI for the latest `dev` commit.

Recovery CI still runs on development pushes, independently of the Vercel build;
a green GitHub development job is not proof of a successful Vercel deployment.
Check the Vercel deployment status. Other connected projects may create previews
for `dev`; their production branch must never be changed to `dev`.

This workflow does **not** automatically modify the development database. For a
schema-dependent change, provision an isolated dev database or complete reviewed
baseline adoption, then apply its versioned migrations to the confirmed dev
connection before deploying that change. Do not use `db push`, reset, or mark a
baseline applied merely to bypass a migration error. Code-only fixes can deploy
without the release approval setup introduced in SKO-212.

## Controlled deployment: staging, QA, production and demo

`.github/workflows/deploy.yml` verifies synthetic recovery before touching these
environments. It requires a reviewed exact SHA, evidence link and forward-recovery
decision, applies versioned migrations, checks migration status/schema drift,
builds that exact checkout and promotes its prebuilt Vercel artifact. Missing
configuration now produces named error messages rather than an unexplained exit 1.

Keep Git-triggered deployments for these branches disabled. Confirm provider
settings and cancel old queued deployments during rollout. Follow [the recovery
runbook](recovery/RUNBOOK.md) for required secrets, per-release approvals, baseline
adoption and incident authorization. Manual dispatch must select the branch
matching the requested environment. Remote settings are not configured by this PR.

## Deploy flow

```
feature branch → dev → staging → qa → production
                                        └→ demo (independent, from main or production)
```

Merge forward; never push straight to `production` without going through QA.

## Demo tenant (exam chain, SKO-500)

The synthetic demo school (`skoolee-demo-synthetic`) is rebuilt by `scripts/demo/reset-demo-tenant.ts`. It only ever
deletes and recreates that one school, labelled `[Synthetic demo]`.

1. Use the demo database only. A non-local database also needs `DEMO_RESET_ALLOW_REMOTE=1`.
2. Run the reset with a fresh password of 12 or more characters:

   ```bash
   DEMO_PASSWORD=<12+ chars> DATABASE_URL=<demo database> npx tsx scripts/demo/reset-demo-tenant.ts
   ```

3. Check the printed manifest against `docs/leap/demo-runbook.md` (counts and fingerprint).
4. Sign in as `demo-teacher@example.invalid` for the Syllabus Drop (Grade 7 A Mathematics), the Teaching Line
   (Science) and "Papers you owe"; as `demo-principal@example.invalid` for Exams → Papers (request papers, remind,
   change author or moderator); as `demo-hod@example.invalid` for Department approvals and moderation.
5. For a fast local rehearsal, run Postgres on loopback and point `DATABASE_URL` and `DIRECT_URL` at it; a
   remote database makes every page wait on round trips. Load the schema with `npx prisma db push` first.
6. Text uploads extract without an AI provider when `SCHOOL_AI_STORAGE_DIR` points at a writable private folder;
   photos and PDFs need the approved media provider (`SCHOOL_AI_MEDIA_EGRESS_APPROVED=true`). The outline step uses
   fixed rules when no text provider is configured.
