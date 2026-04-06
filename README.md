# Yanak MVP Platform

Monorepo for a framing workshop MVP with:

- `apps/web` - customer constructor (Next.js, port `3000`)
- `apps/backoffice` - admin/manager/worker UI (Next.js, port `3001`)
- `apps/api` - unified backend API (NestJS, port `4000`)
- `packages/pricing` - shared pricing engine
- `packages/types` - shared domain types
- `packages/ui` - shared UI primitives

## Quick start

1. Скопируйте `.env.example` → `.env` и при необходимости поправьте `DATABASE_URL`.

2. Установите зависимости:

```bash
npm install
```

### Вариант A — всё в Docker (проще всего для проверки)

Поднимает Postgres, Redis, API, витрину и админку. Для **локальной** машины (без прод-доменов в сборке витрины):

```bash
npm run compose:local
```

Откройте: **http://localhost:3000** (витрина), **http://localhost:3001** (админка), API **http://localhost:4001**.

Если витрина раньше собиралась с прод-`NEXT_PUBLIC_API_BASE_URL`, один раз пересоберите: в `.env` задайте `FORCE_WEB_NEXT_BUILD=1` и снова `npm run compose:local` (потом верните `0`).

Прод-сервер с доменами и Caddy: `npm run compose:https` (см. `deploy/Caddyfile`).

Обычный `npm run compose:up` использует переменные из `.env` как есть (в т.ч. `NEXT_PUBLIC_API_BASE_URL` — тогда витрина в Docker может ходить на указанный там API).

Первый запуск с пустой БД: один раз `RUN_SEED_ON_START=1` или `npm run db:seed && npm run auth:seed` в контейнере API — см. `.env.example`.

### Вариант B — Node на хосте (`npm run dev`)

Нужны **Node ≥ 20**, локальный **PostgreSQL** (и при необходимости Redis). Скрипты `dev` подмешивают корневой `.env` и **`config/env.local-dev.env`**, чтобы витрина не уводила запросы на продакшен-API из `.env`.

Сначала поднимите только БД (порт **5433** на хосте):

```bash
docker compose up -d postgres redis
```

В `.env` для этого случая укажите:

`DATABASE_URL=postgresql://yanak:yanak@localhost:5433/yanak?schema=public`

Затем в корне репозитория:

```bash
npm run dev
```

Откройте **http://localhost:3000** и **http://localhost:3001** (API должен слушать **4000** — см. `BACKEND_API_URL` в `.env`).

Сид каталога и учёток в БД по умолчанию **не** выполняется при каждом перезапуске API. Первый запуск или пустая БД: выполните `npm run db:seed && npm run auth:seed` (на хосте при настроенном `DATABASE_URL`) или см. вариант Docker выше. Подробности в `.env.example`.

## First API endpoints

- `GET /api/system/health`
- `POST /api/pricing/calculate`
- `GET /api/catalog/frames?category=wood|plastic|aluminum&limit=200`
- `POST /api/orders`

## Каталог багетов с сайта (артикулы, цены, картинки)

Данные подтягиваются с конструктора [bagetnaya-masterskaya.com](https://bagetnaya-masterskaya.com/baget_online) в `data/baget-catalog.json`.

```bash
npm run catalog:pull
```

Опционально скачать JPG в `apps/web/public/baget-assets/` (офлайн-превью):

```bash
npm run catalog:download-images
```

После скачивания картинки лежат в `apps/web/public/baget-assets/{sku}.jpg`. Список успешных и отсутствующих на сайте — в `data/baget-assets-manifest.json` (у части артикулов файла на сервере действительно нет).

Превью в конструкторе сначала пытается загрузить **локальный** `/baget-assets/{sku}.jpg`, затем оригинал с сайта; если оба недоступны — показывается аккуратная заглушка без «белых дыр».

## Next implementation priorities

1. Add Prisma schema and migrations for orders/catalog/users.
2. Add auth module and role-based guards.
3. Build constructor flow: image upload, size inputs, material picks, preview.
4. Connect web/backoffice to real API and pricing rules from DB.
