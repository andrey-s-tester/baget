#!/usr/bin/env bash
# Восстановление из бэкапа (после docker compose up, контейнер postgres должен работать).
# Использование:
#   RESTORE_DIR=./backups/yanak-20260101-030000 ./scripts/server-restore.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${RESTORE_DIR:-}" ]] || [[ ! -d "$RESTORE_DIR" ]]; then
  echo "Set RESTORE_DIR to a backup folder, e.g.:" >&2
  echo "  RESTORE_DIR=$ROOT/backups/yanak-20260101-030000 $0" >&2
  exit 1
fi

PG_CONTAINER="${PG_CONTAINER:-yanak-postgres}"

if [[ -f "$RESTORE_DIR/db.sql.gz" ]]; then
  echo "Restoring database from db.sql.gz..."
  gunzip -c "$RESTORE_DIR/db.sql.gz" | docker exec -i "$PG_CONTAINER" psql -U yanak -d yanak -v ON_ERROR_STOP=1
else
  echo "No db.sql.gz in $RESTORE_DIR — skip DB." >&2
fi

if [[ -f "$RESTORE_DIR/baget-assets.tar.gz" ]]; then
  echo "Extracting baget-assets..."
  tar xzf "$RESTORE_DIR/baget-assets.tar.gz" -C "$ROOT"
fi

if [[ -f "$RESTORE_DIR/data-json.tar.gz" ]]; then
  echo "Extracting data/ (JSON seeds)..."
  tar xzf "$RESTORE_DIR/data-json.tar.gz" -C "$ROOT"
fi

echo "Restore finished. Restart app containers if needed: docker compose restart web backoffice api"
