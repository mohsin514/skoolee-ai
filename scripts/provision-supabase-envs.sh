#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# provision-supabase-envs.sh — one Supabase project (DB) PER environment.
#
# FULL ISOLATION model: dev / staging / qa / production / demo each get their
# OWN Supabase project, so no environment can read or write another's tenant
# data. This replaces the earlier shared-DB model. See docs/ENVIRONMENTS.md.
#
# You provision the projects with EITHER path:
#
#   A) DASHBOARD (recommended, no token):  supabase.com → New project ×5
#   B) MANAGEMENT API (scripted):          needs a Supabase Personal Access
#      Token (Account → Access Tokens) exported as SUPABASE_ACCESS_TOKEN, and
#      your org id + a db password. Creating projects may incur cost.
#
# This script only drives path B when SUPABASE_ACCESS_TOKEN is set; otherwise
# it prints the dashboard runbook.
#
# After each project exists, collect its connection strings and put them in the
# matching GitHub Environment secrets and Vercel project env vars:
#   DATABASE_URL  → Connection Pooling (Transaction) URI, port 6543
#   DIRECT_URL    → Direct connection URI,                port 5432
# plus NEXT_PUBLIC_SUPABASE_URL and the anon/service keys from the same project.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENVS=(dev staging qa production demo)
REGION="${SUPABASE_REGION:-us-east-1}"        # match your users' region
ORG_ID="${SUPABASE_ORG_ID:-}"                 # required for API path
API="https://api.supabase.com/v1"

print_runbook() {
  cat <<'EOF'
DASHBOARD RUNBOOK — repeat 5×, once per environment
────────────────────────────────────────────────────
1. supabase.com/dashboard → New project
      Name:   skoolee-<env>   (skoolee-dev, skoolee-staging, skoolee-qa,
                               skoolee-prod, skoolee-demo)
      Region: same for all (lowest latency to your users)
      Set a strong DB password and SAVE it.
2. Project → Settings → Database → Connection string:
      • "Transaction" pooler URI (port 6543)  → DATABASE_URL
      • "Session"/direct URI     (port 5432)  → DIRECT_URL
3. Project → Settings → API:
      • Project URL        → NEXT_PUBLIC_SUPABASE_URL
      • anon public key    → SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      • service_role key   → SUPABASE_SERVICE_ROLE_KEY
      • JWT secret         → SUPABASE_JWT_SECRET
4. Put DATABASE_URL + DIRECT_URL in:
      • GitHub → repo → Settings → Environments → <env> → Add secret
      • Vercel → skoolee-ai-<env> → Settings → Environment Variables
5. The GitHub Action (.github/workflows/deploy.yml) runs
   `prisma migrate deploy` on the next push to that branch — a FRESH empty
   DB gets all 26 migrations applied cleanly. No hand-backfill needed.

⚠  Migrations run against DIRECT_URL (port 5432), never the pooler.
⚠  Never point two environments at the same project — that defeats isolation.
EOF
}

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN not set → printing dashboard runbook."
  echo
  print_runbook
  exit 0
fi

if [[ -z "$ORG_ID" ]]; then
  echo "SUPABASE_ORG_ID is required for the API path. List orgs with:" >&2
  echo "  curl -s $API/organizations -H \"Authorization: Bearer \$SUPABASE_ACCESS_TOKEN\"" >&2
  exit 1
fi

command -v jq >/dev/null || { echo "jq is required for the API path"; exit 1; }

for env in "${ENVS[@]}"; do
  name="skoolee-${env}"
  echo "─────────────────────────────────────────────"
  echo "Creating Supabase project: $name (region $REGION)"
  read -r -s -p "DB password for $name: " dbpass; echo
  resp=$(curl -s -X POST "$API/projects" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg n "$name" --arg o "$ORG_ID" --arg r "$REGION" --arg p "$dbpass" \
          '{name:$n, organization_id:$o, region:$r, db_pass:$p, plan:"free"}')")
  ref=$(echo "$resp" | jq -r '.id // empty')
  if [[ -z "$ref" ]]; then
    echo "FAILED for $name:"; echo "$resp" | jq . 2>/dev/null || echo "$resp"
    continue
  fi
  echo "Created $name  ref=$ref"
  echo "  Project URL: https://$ref.supabase.co"
  echo "  Fetch connection strings from the dashboard (Settings → Database)."
  echo "  Then add DATABASE_URL/DIRECT_URL to GitHub env '$env' and Vercel 'skoolee-ai-$env'."
done

echo
echo "All projects requested. Provisioning takes a couple of minutes each."
echo "Collect connection strings + keys and wire secrets (see runbook: $0 with no token)."
