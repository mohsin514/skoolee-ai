#!/usr/bin/env bash
# Disposable loopback Postgres cluster for QA suites. Replaces the lost /private/tmp/sko-isolated-env.sh.
#   scripts/qa/isolated-env.sh up <port> [db] [--schema]   start (initdb if missing); --schema applies migrations
#   scripts/qa/isolated-env.sh down <port>
#   scripts/qa/isolated-env.sh status <port>
# Clusters live under /private/tmp/sko-isolated/pg<port>/data (the layout the existing QA clusters use). Never point this at a shared database.
set -euo pipefail
cmd=${1:-}; port=${2:-}; db=${3:-postgres}
[[ "$cmd" =~ ^(up|down|status)$ && "$port" =~ ^554[0-9][0-9]$ ]] || { echo "usage: $0 up|down|status <554xx> [db] [--schema]" >&2; exit 2; }
root=/private/tmp/sko-isolated/pg$port; data=$root/data
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
case $cmd in
  up)
    if [[ ! -f $data/PG_VERSION ]]; then mkdir -p "$root"; initdb -D "$data" -U "$USER" --auth=trust --encoding=UTF8 >/dev/null; fi
    pg_ctl -D "$data" status >/dev/null 2>&1 || pg_ctl -D "$data" -o "-p $port -k $root -c listen_addresses=127.0.0.1" -l "$root/pg.log" -w start >/dev/null
    psql -h 127.0.0.1 -p "$port" -d postgres -Atc "select 1 from pg_database where datname='$db'" | grep -q 1 || createdb -h 127.0.0.1 -p "$port" "$db"
    url="postgresql://$USER@127.0.0.1:$port/$db"
    if [[ " $* " == *" --schema "* ]]; then DATABASE_URL=$url DIRECT_URL=$url npx prisma migrate deploy; fi
    echo "$url" ;;
  down) pg_ctl -D "$data" -w stop ;;
  status) pg_ctl -D "$data" status ;;
esac
