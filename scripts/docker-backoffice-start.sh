#!/bin/sh
# Backoffice в Docker: ждём API, затем next build (по умолчанию всегда — см. ниже).
# Keep POSIX flags only for /bin/sh in alpine.
set -e
cd /app

if [ ! -x node_modules/.bin/next ]; then
  npm install --no-audit --no-fund
fi

echo "Waiting for API (http://api:4000/api/system/health)..."
i=0
# До ~10 мин: первый старт API (npm install, prisma, nest build) часто дольше 3 мин;
# если выйти раньше — контейнер админки падает с exit 1 и кажется «не запустилась».
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

# NEXT_DEV_FRONTEND=1 — next dev: правки сразу видны. NEXT_DEV_FRONTEND=0 — build + start для продакшена.
# В Docker на Windows Turbopack часто не видит изменения на bind-mount — используем webpack (dev:webpack).
# Быстрый Turbopack локально на хосте: cd apps/backoffice && npm run dev
if [ "${NEXT_DEV_FRONTEND:-0}" = "1" ]; then
  echo "NEXT_DEV_FRONTEND=1 — next dev (webpack, HMR) на :3001 — надёжно в Docker; WATCHPACK_POLLING=${WATCHPACK_POLLING:-true}"
  export WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}"
  exec npm run dev:webpack -w @yanak/backoffice
fi

BO_NEXT="apps/backoffice/.next"
# Пока идёт next build, без placeholder порт 3001 не слушается — ERR_EMPTY_RESPONSE.
# На время сборки поднимаем scripts/backoffice-build-placeholder.mjs (503 + текст).
# Собираем, если нет готовой сборки или запрошена принудительная пересборка.
# Первый старт / пустой .next: всегда build. После успешного build есть BUILD_ID — по умолчанию пропускаем.
# Важно: после rm .next/static или сбоя сборки BUILD_ID мог остаться — тогда HTML есть, а /_next/*.js даёт 404.
# Аналогично: пустой server/chunks при целом static даёт 500 «Cannot find module './663.js'» на dashboard.
# Нельзя считать сборку production-годной, если есть static/development (артефакт next dev): иначе
# пропускаем next build, запускаем next start, а браузер тянет app/layout.css / main-app.js → 404.
backoffice_build_usable() {
  test -f "$BO_NEXT/BUILD_ID" \
    && ! test -d "$BO_NEXT/static/development" \
    && test -d "$BO_NEXT/static/chunks" \
    && test -d "$BO_NEXT/static/css" \
    && test -n "$(ls -A "$BO_NEXT/static/chunks" 2>/dev/null)" \
    && test -n "$(ls -A "$BO_NEXT/static/css" 2>/dev/null)" \
    && test -f "$BO_NEXT/server/webpack-runtime.js" \
    && test -d "$BO_NEXT/server/chunks" \
    && test -n "$(ls -A "$BO_NEXT/server/chunks" 2>/dev/null)" \
    && test -f "$BO_NEXT/server/app/dashboard/page.js"
}

FORCE="${FORCE_BACKOFFICE_NEXT_BUILD:-0}"
SKIP="${SKIP_BACKOFFICE_NEXT_BUILD:-0}"
if [ "$SKIP" = "1" ] && backoffice_build_usable; then
  echo "SKIP_BACKOFFICE_NEXT_BUILD=1 — пропускаем next build (полная сборка)"
elif [ "$FORCE" != "1" ] && backoffice_build_usable; then
  echo "Сборка в порядке ($BO_NEXT/BUILD_ID + static/chunks) — пропускаем next build. Пересборка: FORCE_BACKOFFICE_NEXT_BUILD=1"
else
  if [ -f "$BO_NEXT/BUILD_ID" ] && ! backoffice_build_usable; then
    if [ -d "$BO_NEXT/static/development" ]; then
      echo "В .next есть static/development (next dev) — для next start нужен production build, пересобираем"
    else
      echo "BUILD_ID есть, но сборка неполная (static и/или server/chunks) — пересобираем (иначе 404 или 500 Cannot find module)"
    fi
  fi
  echo "next build -w apps/backoffice ..."
  node /app/scripts/backoffice-build-placeholder.mjs &
  PLACEHOLDER_PID=$!
  trap 'kill $PLACEHOLDER_PID 2>/dev/null; wait $PLACEHOLDER_PID 2>/dev/null' EXIT INT TERM
  npm run build -w apps/backoffice
  kill $PLACEHOLDER_PID 2>/dev/null || true
  wait $PLACEHOLDER_PID 2>/dev/null || true
  trap - EXIT INT TERM
fi

echo "Запуск Next.js (next start) на :3001 ..."
exec npm run start -w apps/backoffice
