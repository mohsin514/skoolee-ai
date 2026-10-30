#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-vercel-envs.sh — stand up 5 Vercel projects for SkooleeAI, one per env.
#
# MODEL: separate Vercel project AND Supabase database per environment.
# See docs/ENVIRONMENTS.md and docs/recovery/RUNBOOK.md for isolation and gates.
#
# PREREQS:
#   - Vercel CLI:  npm i -g vercel   (or: npx vercel ...)
#   - Logged in:   vercel login
#   - This repo pushed to GitHub (mohsin514/skoolee-ai) with the env branches.
#
# WHAT THIS DOES:
#   For each environment it links a NEW Vercel project to this repo, sets the
#   project's Production Git branch to the matching branch, and prints the env
#   vars you still need to add (secrets are NOT stored in this repo).
#
# It does NOT upload secret values — you paste those into each project once,
# either in the Vercel dashboard (Project → Settings → Environment Variables)
# or with `vercel env add <NAME> production` per variable.
#
# USAGE:
#   ./scripts/setup-vercel-envs.sh            # interactive, one project at a time
#   ./scripts/setup-vercel-envs.sh --print    # just print the manual runbook
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# env_name | vercel project name | git branch
ENVS=(
  "dev|skoolee-ai-dev|dev"
  "staging|skoolee-ai-staging|staging"
  "qa|skoolee-ai-qa|qa"
  "production|skoolee-ai-prod|production"
  "demo|skoolee-ai-demo|demo"
)

# Variable NAMES required per project. Values come from that environment's
# secret store; this list is never permission to reuse production credentials.
ENV_VARS=(
  DATABASE_URL DIRECT_URL POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING
  NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_JWT_SECRET
  AUTH_SECRET
  AI_PROVIDER AI_PROVIDER_ORDER OPENAI_API_KEY
  SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM_EMAIL SMTP_FROM_NAME
  REDIS_URL EMAIL_DEV_MODE DISABLE_OUTBOUND_MESSAGES
)

print_runbook() {
  cat <<'EOF'
MANUAL RUNBOOK (Vercel dashboard) — repeat for each of the 5 projects
─────────────────────────────────────────────────────────────────────
1. Vercel → Add New → Project → import github.com/mohsin514/skoolee-ai
2. Name the project (skoolee-ai-dev / -staging / -qa / -prod / -demo)
3. Settings → Git → Production Branch → set to the env's branch:
      dev → dev,  staging → staging,  qa → qa,
      production → production,  demo → demo
4. Settings → Environment Variables → add every var from
   .env.<env>.example (values from THAT environment's protected secret store).
   Set NEXT_PUBLIC_APP_URL to THAT project's URL.
   Use a distinct Supabase DB, AUTH_SECRET, object store and queue per environment.
   For synthetic nonproduction tests set EMAIL_DEV_MODE=true and
   DISABLE_OUTBOUND_MESSAGES=true; withhold live provider credentials.
5. Keep Git auto-deploy disabled for staging, qa, production and demo. Follow
   docs/recovery/RUNBOOK.md for exact-SHA approval, migration/recovery evidence,
   and controlled promotion. Only dev uses automatic Git deployment.

Build command is `prisma generate && next build` (from package.json) — no change.

Never copy a generic .env or .env.supabase-backup into a new environment.
Confirm source and target identity before migrations. Do not reset or seed an
existing environment to bypass adoption or migration errors.
EOF
}

if [[ "${1:-}" == "--print" ]]; then
  print_runbook
  exit 0
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI not found. Install with:  npm i -g vercel   then re-run." >&2
  echo "Or read the manual runbook:  $0 --print" >&2
  exit 1
fi

echo "This links 5 Vercel projects to this repo. You'll set secrets after."
echo "Variable names each project needs (environment-specific values; never share production credentials):"
printf '  %s\n' "${ENV_VARS[@]}" NEXT_PUBLIC_APP_URL
echo

for row in "${ENVS[@]}"; do
  IFS='|' read -r env proj branch <<<"$row"
  echo "─────────────────────────────────────────────"
  echo "Environment: $env   Project: $proj   Branch: $branch"
  read -r -p "Link/create '$proj' now? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "skipped $proj"; continue; }

  # Link a project scope named $proj. --yes accepts defaults; framework autodetected.
  vercel link --yes --project "$proj" || {
    echo "link failed for $proj (already linked? wrong scope?)"; continue; }

  # Point production deployments at the env branch.
  vercel git connect >/dev/null 2>&1 || true
  echo ">> In the dashboard set Production Branch = '$branch' for $proj"
  echo ">> Then add env vars from .env.$env.example (see NEXT_PUBLIC_APP_URL)"
done

echo
echo "Done linking. Verify isolated secrets and the matching branch per project."
echo "Follow docs/recovery/RUNBOOK.md before any controlled-environment promotion."
