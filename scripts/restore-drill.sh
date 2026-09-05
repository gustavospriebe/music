#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTORE_DRILL_DATABASE_URL:?RESTORE_DRILL_DATABASE_URL is required}"

if [[ "${RESTORE_DRILL_CONFIRM:-}" != "ERASE_RESTORE_DRILL_DATABASE" ]]; then
  echo "Set RESTORE_DRILL_CONFIRM=ERASE_RESTORE_DRILL_DATABASE to confirm the isolated target." >&2
  exit 2
fi
if [[ "$DATABASE_URL" == "$RESTORE_DRILL_DATABASE_URL" ]]; then
  echo "Source and restore target must be different." >&2
  exit 2
fi

drill_dir="$(mktemp -d)"
trap 'rm -rf -- "$drill_dir"' EXIT
dump_file="$drill_dir/database.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$dump_file" "$DATABASE_URL"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DRILL_DATABASE_URL" "$dump_file"
psql "$RESTORE_DRILL_DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --command \
  "select 'orders=' || count(*) from orders union all select 'migrations=' || count(*) from drizzle.__drizzle_migrations;"

echo "Restore drill completed against the explicitly confirmed isolated database."
