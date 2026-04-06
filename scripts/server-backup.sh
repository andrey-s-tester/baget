#!/usr/bin/env bash
# Резервная копия PostgreSQL и каталогов baget-assets (Linux / Git Bash).
# Запуск из корня репозитория: ./scripts/server-backup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_ROOT/yanak-$STAMP"
mkdir -p "$OUT"

PG_CONTAINER="${PG_CONTAINER:-yanak-postgres}"

if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "Dumping PostgreSQL from $PG_CONTAINER..."
  docker exec "$PG_CONTAINER" pg_dump -U yanak --no-owner yanak | gzip >"$OUT/db.sql.gz"
else
  echo "Warning: container $PG_CONTAINER not running — skip DB dump." >&2
  echo "Start stack: docker compose up -d" >&2
fi

ASSETS_TAR="$OUT/baget-assets.tar.gz"
echo "Archiving baget-assets..."
if [[ -d apps/web/public/baget-assets ]] || [[ -d apps/backoffice/public/baget-assets ]]; then
  tar czf "$ASSETS_TAR" \
    -C "$ROOT" \
    apps/web/public/baget-assets \
    apps/backoffice/public/baget-assets \
    2>/dev/null || true
else
  echo "(no baget-assets dirs)"
fi

# Опционально: JSON-сиды из data/ (если правили вручную на сервере)
if [[ -d data ]]; then
  tar czf "$OUT/data-json.tar.gz" -C "$ROOT" data 2>/dev/null || true
fi

echo "Backup complete: $OUT"
ls -la "$OUT"
