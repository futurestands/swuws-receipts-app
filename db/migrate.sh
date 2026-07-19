#!/usr/bin/env bash
#
# Certification Finding: no migration tracking existed — migrations were
# run via a naive shell for-loop with no record of what had already been
# applied, risking duplicate execution against a database that had already
# been migrated once by hand.
#
# This script is additive: it does not modify 0001_init.sql,
# 0002_immutability.sql, 0003_audit_log_immutability.sql, or
# 0004_rate_limit.sql at all. It just wraps them with a small ledger table.
#
# Usage:
#   DATABASE_URL="postgres://..." ./db/migrate.sh
# or:
#   npm run db:migrate

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
  create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamp not null default now()
  );
"

for f in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$f")"

  already="$(psql "$DATABASE_URL" -t -A -c "select 1 from schema_migrations where filename = '$name';")"
  if [ "$already" = "1" ]; then
    echo "-- skipping $name (already applied)"
    continue
  fi

  echo "-- applying $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
    "insert into schema_migrations (filename) values ('$name');"
  echo "-- recorded $name"
done

echo "All migrations applied."
