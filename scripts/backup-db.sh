#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.backup"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.backup.example and fill in credentials."
  exit 1
fi

source "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-$HOME/curaciones-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
FILENAME="curaciones-${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "[$(date)] Starting backup..."

# A failing pg_dump still leaves the gzip target behind — a ~20 byte file that
# looks like a backup in a directory listing. Delete the artifact on any
# failure, and refuse to call an implausibly small dump a success.
cleanup_partial() {
  rm -f "$FILEPATH"
  echo "[$(date)] Backup FAILED; removed partial $FILEPATH" >&2
}
trap cleanup_partial ERR

pg_dump "$DATABASE_URL" | gzip > "$FILEPATH"

MIN_BYTES=10240
ACTUAL_BYTES=$(wc -c < "$FILEPATH" | tr -d ' ')
if [ "$ACTUAL_BYTES" -lt "$MIN_BYTES" ]; then
  echo "[$(date)] Backup only ${ACTUAL_BYTES} bytes, below the ${MIN_BYTES} byte floor" >&2
  false
fi

trap - ERR
echo "[$(date)] Backup saved to $FILEPATH ($(du -h "$FILEPATH" | cut -f1))"

# Rotate old backups
echo "[$(date)] Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "curaciones-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date)] Backup complete."
