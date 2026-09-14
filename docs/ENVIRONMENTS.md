# Environments

SkooleeAI runs five environments, each backed by its **own Vercel project** but
sharing the **same Supabase database** (per current infrastructure decision).

| Environment | Git branch  | Vercel project (suggested) | Purpose                                  |
|-------------|-------------|----------------------------|------------------------------------------|
| Development | `dev`       | `skoolee-ai-dev`           | Active feature work, unstable            |
| Staging     | `staging`   | `skoolee-ai-staging`       | Pre-release integration                  |
| QA          | `qa`        | `skoolee-ai-qa`            | Test/validation passes                   |
| Production  | `production`| `skoolee-ai-prod`          | Live traffic                             |
| Demo        | `demo`      | `skoolee-ai-demo`          | Sales / showcase                         |

> **`qa` branch** — the old `qa/wave1-isolation-auth-a11y` branch (fully merged
> into `main`) was deleted so the QA environment branch can be named simply `qa`.

> **Note on `main`** — the pre-existing Vercel project is linked to `main`. Leave
> that project as-is; the five projects above are additional. If you prefer, point
> the existing project's Production branch at `production` and treat `main` as an
> integration trunk.

## ⚠️ Shared-database caveat

All five environments read and write the **same Supabase Postgres instance**.
That means:

- A demo or QA action **mutates production tenant data**. There is no isolation.
- Schema changes (`prisma db push`) applied from any environment affect **all** of
  them at once.
- Destructive scripts (`db:reset`, `db:seed`) must **never** be run against this
  DB from a non-production context.

If data isolation is later required, the clean fix is a separate Supabase project
(or at least a separate database/schema prefix) per environment. This doc assumes
the shared-DB model was chosen deliberately.

## Environment variables

Each environment has an example file in the repo root:

- `.env.dev.example`
- `.env.staging.example`
- `.env.qa.example`
- `.env.production.example`
- `.env.demo.example`

These contain **placeholders only** — no secrets are committed. Real values live
in each Vercel project's Environment Variables, and locally in `.env` (gitignored).

The only value that legitimately differs per environment is `NEXT_PUBLIC_APP_URL`
(each Vercel project gets its own URL). Everything else — the Supabase DB URLs,
Supabase keys, `OPENAI_API_KEY`, `AUTH_SECRET`, SMTP — is shared because the DB is
shared. Copy them from your secure store (they are in `.env.supabase-backup`
locally, which is gitignored).

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
