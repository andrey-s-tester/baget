# Деплой Yanak на Linux-сервер (Docker)

Краткий план переноса **кода**, **PostgreSQL** и **файлов изображений каталога**.

Деплой **на Windows + домен + Cloudflare**: см. [WINDOWS.md](./WINDOWS.md).

## Что хранится где

| Компонент | Где живёт | Перенос |
|-----------|-----------|---------|
| Бизнес-данные | PostgreSQL (том `postgres_data`) | Дамп `pg_dump` → восстановление на сервере |
| Загруженные фото багета | `apps/web/public/baget-assets/` и `apps/backoffice/public/baget-assets/` (скрипт загрузки пишет в оба каталога) | Скопировать каталоги или архив из бэкапа |
| Сиды / справочники из JSON | `data/*.json` | Уже в репозитории; при первом старте с `RUN_SEED_ON_START=1` подтягиваются в БД |
| Сборки Next | тома `web_next_build`, `backoffice_next_build` | Пересобираются на сервере при `docker compose up` (не копировать с Windows) |
| Redis | том не именован в compose для данных | Можно поднять пустой; кэш не критичен для переноса |

## Требования

- Docker + Docker Compose v2
- Git, доступ к репозиторию
- Рекомендуется reverse proxy (Caddy / Nginx) с TLS для доменов витрины, API и админки

## Домен и DNS

Чтобы имена из `deploy/Caddyfile` открывались из интернета:

1. **Сервер с белым IP** (VPS), порты **80 и 443** открыты на фаерволе.
2. **A-записи** у регистратора или в Cloudflare: корень, `www`, `api`, `admin` → **публичный IPv4** этого сервера (как в Caddyfile: `bagetnaya-yanak.ru`, `www.…`, `api.…`, `admin.…`).
3. Если DNS ведётся в **Cloudflare**: в `.env` задайте `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_NAME` (или `CLOUDFLARE_ZONE_ID`), `TARGET_IPV4` (IP сервера или `auto`, если скрипт запускаете **на самом сервере**), затем из корня репозитория выполните `npm run dns:cf-sync`. Проверка без изменений: `node scripts/dns-cloudflare-sync.mjs --dry-run`. В Cloudflare для TLS с Caddy обычно выбирают **SSL/TLS → Full (strict)**.
4. У другого регистратора (REG.RU, NIC и т.д.) те же четыре A-записи задаются вручную в разделе DNS; отдельного «подключения к Configure» к вашему коду не требуется — нужны только верные записи на IP сервера.
5. **Домашний интернет / динамический IP**: либо DDNS у регистратора, либо туннель (**ngrok** в этом репозитории, см. `docs/ngrok-and-domains.md`), либо Cloudflare Tunnel — иначе A-запись быстро устареет.

### Подъём с TLS одной командой (Windows / сервер с PowerShell)

На машине с Docker, в корне репозитория, после заполнения `.env`:

- `DATABASE_URL` — для Docker на Linux обычно `postgresql://yanak:ПАРОЛЬ@postgres:5432/yanak?schema=public` (как в `docker-compose.yml`, не `localhost`).
- `CORS_ORIGINS` — `https://bagetnaya-yanak.ru`, `https://www.bagetnaya-yanak.ru`, `https://admin.bagetnaya-yanak.ru`.
- `NEXT_PUBLIC_API_BASE_URL=https://api.bagetnaya-yanak.ru`
- `COOKIE_SECURE=1`
- при смене `NEXT_PUBLIC_*` пересоберите витрину: `FORCE_WEB_NEXT_BUILD=1` (и при необходимости `FORCE_BACKOFFICE_NEXT_BUILD=1`) перед `docker compose up`.

Команда: **`npm run compose:domain`** (проверит `.env` и выполнит `docker compose --profile https up -d`). Без проверки, только Caddy: `npm run compose:https`.

## Подготовка на сервере

1. Клонировать репозиторий в каталог, например `/opt/yanak`.
2. Скопировать `.env.example` → `.env` и заполнить:
   - `DATABASE_URL` — строка подключения к Postgres **внутри** Docker-сети (как в `docker-compose.yml`: `postgresql://yanak:ПАРОЛЬ@postgres:5432/yanak?schema=public`).
   - На проде **смените пароль** `POSTGRES_PASSWORD` в `docker-compose.yml` (секция `postgres.environment`) и пользователя/БД при необходимости — и синхронно в `DATABASE_URL` у API.
   - `CORS_ORIGINS` — домены витрины и админки (через запятую).
   - Для сборки витрины с правильным API: `API_URL` / `NEXT_PUBLIC_API_BASE_URL` под ваш публичный URL API.
3. Первый запуск БД с сидами (один раз): в `.env` выставить `RUN_SEED_ON_START=1`, поднять стек, дождаться API healthy, затем **вернуть** `RUN_SEED_ON_START=0`, чтобы рестарты не перезаписывали данные.
4. `docker compose up -d` из корня проекта.

## Порты (по умолчанию в `docker-compose.yml`)

- `3000` — витрина (web)
- `3001` — backoffice
- `4001` — API (внутри контейнера 4000)
- `5433` — Postgres на хосте (для отладки; **на проде лучше не публиковать наружу** — закройте firewall или уберите `ports` у `postgres` в отдельном override-файле)

За reverse proxy проксируйте HTTPS → нужные порты и задайте переменные окружения для публичных URL.

## Перенос с текущей машины

1. **База:** см. `scripts/server-backup.sh` — создаётся `db.sql.gz`.
2. **Файлы:** в архив попадают оба `baget-assets` (если есть файлы кроме `.gitkeep`).
3. На сервере: развернуть репозиторий, положить дамп и архив, выполнить `scripts/server-restore.sh` (после `docker compose up`, чтобы контейнер `yanak-postgres` существовал).

Восстановление SQL поверх **непустой** БД может конфликтовать с уже существующими таблицами. Для «чистого» переноса проще один раз удалить том Postgres на сервере (`docker compose down`, удалить volume `postgres_data`) и поднять заново, затем выполнить restore.

Подробности — в комментариях внутри скриптов.

### Локально (Windows)

Скрипты — bash: удобнее **Git Bash** или WSL. Либо выполняйте команды `docker exec ... pg_dump` вручную по аналогии со скриптом.

## Обновление версии

```bash
cd /opt/yanak
git pull
docker compose up -d --build
```

Миграции Prisma выполняются при старте контейнера `api` (`prisma migrate deploy`).

## Админка: белая страница «Internal Server Error» (`admin.…`)

Частые причины:

1. **Повреждённая или dev-сборка в томе** `backoffice_next_build` (после `next dev` или обрыва `next build`). Пересобрать контейнер админки:
   ```bash
   FORCE_BACKOFFICE_NEXT_BUILD=1 docker compose up -d backoffice
   ```
2. **Логи:** `docker compose logs backoffice --tail 150` — искать ошибки при `next build` / `next start`.
3. **Middleware и сессия:** проверка логина идёт через прокси **`/api/auth/me` на том же хосте**, а не напрямую в Nest из Edge (иначе при сборке без `BACKEND_API_URL` ломался прод).

## Резервное копирование по расписанию

Поставьте cron на сервере, например ежедневно:

```bash
0 3 * * * cd /opt/yanak && ./scripts/server-backup.sh >> /var/log/yanak-backup.log 2>&1
```

Переменная `BACKUP_ROOT` задаёт каталог для архивов (по умолчанию `./backups` в корне репозитория).
