#!/usr/bin/env bash
# Isolated Next.js app for browser QA against a disposable cluster. Replaces the lost /private/tmp/sko-app.sh.
#   scripts/qa/app.sh <appPort> <dbPort> [db]
# Outbound messages are disabled; the AI key is empty unless QA_OPENAI_API_KEY is exported (live-provider checks only).
set -euo pipefail
app=${1:-}; dbport=${2:-}; db=${3:-postgres}
[[ "$app" =~ ^3[0-9]{3}$ && "$dbport" =~ ^554[0-9][0-9]$ ]] || { echo "usage: $0 <3xxx> <554xx> [db]" >&2; exit 2; }
url="postgresql://$USER@127.0.0.1:$dbport/$db"
export DATABASE_URL=$url DIRECT_URL=$url NEXT_BUILD_DIR=.next-app$app NEXT_PUBLIC_APP_URL=http://localhost:$app \
  DISABLE_OUTBOUND_MESSAGES=1 EMAIL_DEV_MODE=true OPENAI_API_KEY=${QA_OPENAI_API_KEY:-} \
  AUTH_SECRET=${QA_AUTH_SECRET:-school-ai-isolated-browser-test-secret-only} SCHOOL_AI_STORAGE_DIR=/private/tmp/sko-isolated/storage-$app
exec npx next dev -p "$app"
