# Environments

SkooleeAI runs five environments. Each has its **own Vercel project** AND its
**own Supabase database** — full isolation, so no environment can read or write
another's tenant data.

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
| Pooler URI (port 6543)         | `DATABASE_URL` (runtime)                         |
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
Values that legitimately stay the same across envs: `OPENAI_API_KEY`, SMTP, and
(optionally) `AUTH_SECRET` — though a distinct `AUTH_SECRET` per env is safer.

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
