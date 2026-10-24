#!/usr/bin/env bash
# Vercel "Ignored Build Step" (wired in vercel.json → ignoreCommand).
# Exit 0 = skip this build, exit 1 = build.
#
# Every environment has its own Vercel project linked to the same repo, so a
# push to `dev` used to build in all of them (qa, staging, prod, demo and the
# old `main` project too). Each project now builds only its own branch.
#
# A project's branch comes from SKOOLEE_DEPLOY_BRANCH (set it in the project's
# env vars), or else is read from its production domain / project URL.
set -u
BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
PROJECT_URL="${VERCEL_PROJECT_PRODUCTION_URL:-}"
OWN="${SKOOLEE_DEPLOY_BRANCH:-}"

if [ -z "$OWN" ]; then
  case "$PROJECT_URL" in
    *dev*)            OWN="dev" ;;
    *qa*)             OWN="qa" ;;
    *stag*)           OWN="staging" ;;
    *demo*)           OWN="demo" ;;
    *prod*|app.*|www.*|skooleeai.com) OWN="production" ;;
    *)                OWN="" ;;
  esac
fi

if [ -n "$OWN" ] && [ "$BRANCH" = "$OWN" ]; then
  echo "Building: branch '$BRANCH' belongs to this project ($PROJECT_URL)."
  exit 1
fi
echo "Skipping: branch '$BRANCH' is not this project's branch ('${OWN:-unknown}', $PROJECT_URL)."
exit 0
