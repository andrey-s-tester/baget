#!/bin/sh
# Сайт (конструктор) в Docker: ждём API, затем next build, затем next start.
# next dev в iframe из админки даёт «missing required error components» при сбоях рендера.
set -e
cd /app

if [ ! -x node_modules/.bin/next ]; then
  npm install --no-audit --no-fund
fi

echo "Waiting for API (http://api:4000/api/system/health)..."
i=0
while [ "$i" -lt 120 ]; do
  if node -e "fetch('http://api:4000/api/system/health').then(r=>r.json()).then(d=>process.exit(d.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "API is ready"
    break
  fi
  i=$((i + 1))
  if [ "$i" -eq 120 ]; then
    echo "API not ready after 120 attempts (~10 min) — см. docker logs yanak-api"
    exit 1
  fi
  sleep 5
  echo "retry... ($i/120)"
done

sleep 3

# NEXT_DEV_FRONTEND=1 — next dev: правки в коде сразу видны в браузере (HMR), без next build.
# NEXT_DEV_FRONTEND=0 — production: next build + next start (нужен при смене кода: FORCE_WEB_NEXT_BUILD=1).
if [ "${NEXT_DEV_FRONTEND:-0}" = "1" ]; then
  echo "NEXT_DEV_FRONTEND=1 — next dev на :3000 (hot reload)"
  export WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}"
  exec npm run dev -w apps/web
fi

WEB_NEXT="apps/web/.next"
web_build_usable() {
  test -f "$WEB_NEXT/BUILD_ID" \
    && ! test -d "$WEB_NEXT/static/development" \
    && test -d "$WEB_NEXT/static/chunks" \
    && test -d "$WEB_NEXT/static/css" \
    && test -n "$(ls -A "$WEB_NEXT/static/chunks" 2>/dev/null)" \
    && test -n "$(ls -A "$WEB_NEXT/static/css" 2>/dev/null)" \
    && test -f "$WEB_NEXT/server/webpack-runtime.js" \
    && test -d "$WEB_NEXT/server/chunks" \
    && test -n "$(ls -A "$WEB_NEXT/server/chunks" 2>/dev/null)" \
    && test -f "$WEB_NEXT/server/app/page.js"
}

FORCE="${FORCE_WEB_NEXT_BUILD:-0}"
SKIP="${SKIP_WEB_NEXT_BUILD:-0}"
if [ "$SKIP" = "1" ] && web_build_usable; then
  echo "SKIP_WEB_NEXT_BUILD=1 — пропускаем next build (полная сборка)"
elif [ "$FORCE" != "1" ] && web_build_usable; then
  echo "Сборка в порядке ($WEB_NEXT/BUILD_ID + static/chunks) — пропускаем next build. Пересборка: FORCE_WEB_NEXT_BUILD=1"
else
  if [ -f "$WEB_NEXT/BUILD_ID" ] && ! web_build_usable; then
    if [ -d "$WEB_NEXT/static/development" ]; then
      echo "В .next есть static/development (next dev) — для next start нужен production build, пересобираем"
    else
      echo "BUILD_ID есть, но сборка неполная (static и/или server/chunks) — пересобираем"
    fi
  fi
  echo "next build -w apps/web ..."
  npm run build -w apps/web
fi

echo "Запуск Next.js (web, next start) на :3000 ..."
exec npm run start -w apps/web
