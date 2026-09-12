#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTORE_DRILL_DATABASE_URL:?RESTORE_DRILL_DATABASE_URL is required}"
if [[ "${RESTORE_DRILL_CONFIRM:-}" != "ERASE_RESTORE_DRILL_DATABASE" ]]; then
  echo "Confirm the isolated restore target with RESTORE_DRILL_CONFIRM=ERASE_RESTORE_DRILL_DATABASE." >&2
  exit 2
fi
query() { PGDATABASE="$1" PGCONNECT_TIMEOUT=10 psql --dbname="$1" --no-psqlrc -X -At --set=ON_ERROR_STOP=1 --command "$2"; }
identity_sql="select current_database() || ':' || coalesce(inet_server_addr()::text,'socket') || ':' || coalesce(inet_server_port()::text,'local')"
source_identity="$(query "$DATABASE_URL" "$identity_sql")"
target_identity="$(query "$RESTORE_DRILL_DATABASE_URL" "$identity_sql")"
target_name="$(query "$RESTORE_DRILL_DATABASE_URL" 'select current_database()')"
if [[ "$source_identity" == "$target_identity" || ! "$target_name" =~ (_restore|_restore_drill)$ ]]; then
  echo "Refused: destination must be another isolated database ending in _restore or _restore_drill." >&2
  exit 2
fi

drill_dir="$(mktemp -d)"
trap 'rm -rf -- "$drill_dir"' EXIT
counts_sql="select 'orders=' || count(*) from orders union all select 'migrations=' || count(*) from drizzle.__drizzle_migrations union all select 'files=' || count(*) from stored_files union all select 'productions=' || count(*) from productions union all select 'consents=' || count(*) from order_consents union all select 'payments=' || count(*) from payments order by 1"
query "$DATABASE_URL" "$counts_sql" > "$drill_dir/source-counts"
PGDATABASE="$DATABASE_URL" PGCONNECT_TIMEOUT=10 pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$drill_dir/database.dump"
PGDATABASE="$RESTORE_DRILL_DATABASE_URL" PGCONNECT_TIMEOUT=10 pg_restore --exit-on-error --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DRILL_DATABASE_URL" "$drill_dir/database.dump"
query "$RESTORE_DRILL_DATABASE_URL" "$counts_sql" > "$drill_dir/restored-counts"
diff -u "$drill_dir/source-counts" "$drill_dir/restored-counts"
echo "Restore completed; row counts and migration journal match. Object storage must be checked separately."
