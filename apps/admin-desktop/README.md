# Yanak Admin (Electron)

Окно Windows с встроенным браузером, открывающее вашу **веб-админку** по HTTPS. На другом ПК достаточно установить `.exe` и в **Файл → Настройки** указать URL опубликованной админки (`https://admin...`).

## Разработка

Из корня репозитория:

```bash
npm install
npm run desktop:start
```

Переменные окружения (опционально):

- `BACKOFFICE_URL` — начальный URL админки
- `YANAK_UPDATE_MANIFEST_URL` — URL JSON манифеста обновлений (если не задан — берётся эвристика от URL админки или поле в настройках)

## Сборка установщика Windows (x64)

```bash
npm run desktop:dist
```

Полная сборка долгая (пересобирается весь backoffice в `bundled-ui`). Если админка уже собиралась и папка `bundled-ui` актуальна — быстрее только упаковать Electron:

```bash
npm run desktop:dist:quick
```

### Сборка в GitHub Actions (рекомендуется, если локально тяжело)

В репозитории есть workflow **«Desktop Admin (Windows)»** (файл `.github/workflows/desktop-admin-windows.yml`).

1. Залейте изменения в GitHub.
2. **Actions** → **Desktop Admin (Windows)** → **Run workflow** (ручной запуск), либо создайте тег вида `desktop-v1.0.2` и запушьте — workflow стартует сам.
3. По завершении в том же запуске скачайте **Artifacts** — там `.exe` (NSIS и portable).

Скрипт подставляет `electron/app-defaults.json` из `electron/app-defaults.json.example`, если файла ещё нет (локальные URL). В установщик попадает `resources/app-defaults.json` — первый запуск без файла в `%AppData%` использует эти URL.

### Сборка с URL ngrok (другой компьютер)

1. Запустите туннели (`docker compose --profile ngrok up -d ngrok`) и сервисы на хосте.
2. Из корня репозитория:

```bash
npm run desktop:dist:ngrok
```

Скрипт читает `http://127.0.0.1:4040/api/tunnels`, пишет `backofficeUrl` (туннель `yanak-admin`) и `updateManifestUrl` (API `yanak-api` + `/api/system/desktop-admin-update`), затем собирает `.exe`. После смены URL ngrok пересоберите установщик.

Артефакты: `apps/admin-desktop/dist-pack/` — установщик NSIS и portable `.exe`.

Версия приложения — поле `version` в `package.json`. Перед релизом увеличьте версию и пересоберите; на API выставьте такую же в `DESKTOP_ADMIN_LATEST_VERSION`.

## Обновления

1. Сервер API должен отвечать на `GET /api/system/desktop-admin-update` (см. `.env.example` и `docs/ngrok-and-domains.md`).
2. В настройках программы можно явно задать URL этого эндпоинта.
3. При старте выполняется тихая проверка; из меню **Справка → Проверить обновления** — с подсказками, если манифест не настроен.

Автоскачивание установщика в фоне не реализовано — пользователь нажимает «Скачать» и открывается ссылка в браузере (типичный подход без подписи кода EV).
