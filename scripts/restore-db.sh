#!/usr/bin/env bash
#
# Restores a NovaDrive Postgres database from a dump made by scripts/backup-db.sh, into a running
# docker-compose.prod.yml stack's `postgres` service. DESTRUCTIVE: drops and recreates every
# object in the target database before restoring (`pg_restore --clean --if-exists`) — anything
# not in the dump is gone afterward. Requires an explicit --yes unless run non-interactively.
#
# Usage:
#   ./scripts/restore-db.sh ./backups/novadrive-20260115T030000Z.dump
#   ./scripts/restore-db.sh --yes ./backups/novadrive-20260115T030000Z.dump   # skip the prompt
#
# See docs/backup-restore.md for when to use this vs. `prisma migrate deploy`, and why the app
# services should be stopped first.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
POSTGRES_USER="${POSTGRES_USER:-novadrive}"
POSTGRES_DB="${POSTGRES_DB:-novadrive}"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

assume_yes=false
dump_file=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) assume_yes=true ;;
    *) dump_file="$arg" ;;
  esac
done

if [ -z "$dump_file" ]; then
  echo "usage: $0 [--yes] <dump-file>" >&2
  exit 1
fi
if [ ! -f "$dump_file" ]; then
  echo "error: '$dump_file' doesn't exist." >&2
  exit 1
fi

if ! compose ps postgres --status running --format '{{.Name}}' | grep -q .; then
  echo "error: the 'postgres' service isn't running (checked via '$COMPOSE_FILE')." >&2
  exit 1
fi

for svc in api worker web migrate; do
  if compose ps "$svc" --status running --format '{{.Name}}' 2>/dev/null | grep -q .; then
    echo "warning: '$svc' is still running — it will keep writing to the database mid-restore." >&2
    echo "Stop it first: docker compose -f $COMPOSE_FILE stop api worker web" >&2
  fi
done

if [ "$assume_yes" != "true" ]; then
  echo "This will DROP every object in database '$POSTGRES_DB' and restore from:"
  echo "  $dump_file"
  read -r -p "Type 'yes' to continue: " confirmation
  if [ "$confirmation" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "Restoring '$POSTGRES_DB' from $dump_file ..."
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$dump_file"

echo "Done. Verify with: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c '\\dt'"
