#!/usr/bin/env bash
#
# Backs up the NovaDrive Postgres database from a running docker-compose.prod.yml stack.
# Runs `pg_dump` *inside* the `postgres` container (it has no host port mapping — see
# docker-compose.prod.yml) in custom format (-Fc): compressed, and restorable with `pg_restore`
# either as a whole or table-by-table, unlike a plain SQL dump.
#
# Usage:
#   ./scripts/backup-db.sh                    # writes to ./backups/novadrive-<timestamp>.dump
#   BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh
#
# See docs/backup-restore.md for the restore procedure, retention/off-host guidance, and the
# managed-service alternative (this script is for the self-hosted docker-compose.prod.yml
# reference stack only — a managed Postgres like RDS should use its own automated backups
# instead).

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_USER="${POSTGRES_USER:-novadrive}"
POSTGRES_DB="${POSTGRES_DB:-novadrive}"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

if ! compose ps postgres --status running --format '{{.Name}}' | grep -q .; then
  echo "error: the 'postgres' service isn't running (checked via '$COMPOSE_FILE')." >&2
  echo "Start the stack first: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d postgres" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$BACKUP_DIR/novadrive-${timestamp}.dump"

echo "Backing up '$POSTGRES_DB' to $out_file ..."
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$out_file"

size="$(du -h "$out_file" | cut -f1)"
echo "Done: $out_file ($size)"
