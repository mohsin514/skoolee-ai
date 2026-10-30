#!/usr/bin/env bash
# Disposable loopback Postgres cluster for QA suites. Replaces the lost /private/tmp/sko-isolated-env.sh.
#   scripts/qa/isolated-env.sh up <port> [db] [--schema]   start (initdb if missing); --schema applies migrations
#   scripts/qa/isolated-env.sh down <port>
#   scripts/qa/isolated-env.sh status <port>
# Clusters live under /private/tmp/sko-isolated/pg<port>/data (the layout the existing QA clusters use). Never point this at a shared database.
set -euo pipefail
# <port> defaults to QA_DB_PORT (then 55438). Ports owned by the in-process fake providers are refused: QA_FAKE_S3_PORT
# (55441), the assignments S3 store (55442) and the identity IdP (55465). See docs/qa/QA-ENVIRONMENT.md.
cmd=${1:-}; port=${2:-${QA_DB_PORT:-55438}}; db=${3:-postgres}
[[ "$cmd" =~ ^(up|down|status)$ && "$port" =~ ^554[0-9][0-9]$ ]] || { echo "usage: $0 up|down|status <554xx> [db] [--schema]" >&2; exit 2; }
for reserved in "${QA_FAKE_S3_PORT:-55441}" 55442 55465; do
  [[ "$port" != "$reserved" ]] || { echo "port $port is reserved for a fake provider; pick another QA_DB_PORT" >&2; exit 2; }
done
root=/private/tmp/sko-isolated/pg$port; data=$root/data
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
case $cmd in
  up)
    if ! pg_ctl -D "$data" status >/dev/null 2>&1 && holder=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1" pid "$2}' | sort -u | paste -sd, -) && [[ -n $holder ]]; then
      echo "port $port is already in use by $holder (not this cluster); stop it or pick another QA_DB_PORT" >&2; exit 3
    fi
    if [[ ! -f $data/PG_VERSION ]]; then mkdir -p "$root"; initdb -D "$data" -U "$USER" --auth=trust --encoding=UTF8 >/dev/null; fi
    pg_ctl -D "$data" status >/dev/null 2>&1 || pg_ctl -D "$data" -o "-p $port -k $root -c listen_addresses=127.0.0.1" -l "$root/pg.log" -w start >/dev/null
    psql -h 127.0.0.1 -p "$port" -d postgres -Atc "select 1 from pg_database where datname='$db'" | grep -q 1 || createdb -h 127.0.0.1 -p "$port" "$db"
    url="postgresql://$USER@127.0.0.1:$port/$db"
    if [[ " $* " == *" --schema "* ]]; then DATABASE_URL=$url DIRECT_URL=$url npx prisma migrate deploy; fi
    echo "$url" ;;
  down) pg_ctl -D "$data" -w stop ;;
  status) pg_ctl -D "$data" status ;;
esac
