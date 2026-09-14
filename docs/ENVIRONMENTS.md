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

Because each DB starts **empty**, the first deploy applies all 26 migrations
cleanly via `prisma migrate deploy` — no hand-backfill of `_prisma_migrations`
(the local-DB quirk noted in project memory) is needed on the new envs.

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

## Git-driven deploy automation

A single workflow, `.github/workflows/deploy.yml`, wires "push a branch → that
environment updates":

1. You push (or merge) to `dev` / `staging` / `qa` / `production` / `demo`.
2. GitHub Actions binds the run to the matching **GitHub Environment**, reads that
   env's `DATABASE_URL` / `DIRECT_URL` secrets, and runs `pnpm prisma migrate
   deploy` against that env's own Supabase DB (migrations use `DIRECT_URL`).
3. Vercel's Git integration builds and deploys that env's Vercel project from the
   same push (Production Branch = the env branch).

So the DB schema is migrated **before** the new build serves traffic, per env.

You can also run it on demand: Actions → "Migrate & Deploy" → Run workflow →
pick an environment.

### One-time secret setup (GitHub)

Settings → Environments → create `dev`, `staging`, `qa`, `production`, `demo`.
For each, add secrets:

| Secret         | Value                                              |
|----------------|----------------------------------------------------|
| `DATABASE_URL` | that env's Supabase **pooler** URI (port 6543)     |
| `DIRECT_URL`   | that env's Supabase **direct** URI (port 5432)     |

Add required reviewers on the `production` environment to gate prod migrations.

### If you want CI to trigger Vercel too (no Git integration)

Uncomment the `deploy:` job in `deploy.yml` and add `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and a per-env `VERCEL_PROJECT_ID`.

## Vercel setup

See `scripts/setup-vercel-envs.sh` for a scripted path (needs the Vercel CLI and a
login), or follow the manual runbook in that file's header comment. Once a Vercel
project's Production branch is set to the matching git branch, every push to that
branch triggers a deploy.

## Deploy flow

```
feature branch → dev → staging → qa → production
                                        └→ demo (independent, from main or production)
```

Merge forward; never push straight to `production` without going through QA.
