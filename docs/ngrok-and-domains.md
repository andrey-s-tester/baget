# Три домена (витрина, API, админка) и ngrok

## Продакшен (реальные домены)

Пример:

| Сервис    | Домен              | Порт приложения |
|----------|--------------------|-----------------|
| Витрина  | `https://shop.example.com`  | Next web :3000  |
| API      | `https://api.example.com`   | Nest :4000      |
| Админка  | `https://admin.example.com` | Next :3001      |

1. Разверните каждый сервис за обратным прокси (nginx, Caddy, Cloudflare) с TLS.
2. В **API** задайте `CORS_ORIGINS` со всеми origin, с которых идут браузерные запросы с cookie, например:
   ```env
   CORS_ORIGINS=https://shop.example.com,https://admin.example.com
   ```
3. **Web** (`apps/web`): при сборке/рантайме укажите URL API, например `API_URL=https://api.example.com` (см. `next.config.ts`).
4. **Backoffice**: `BACKEND_API_URL=https://api.example.com`.
5. Десктопная админка: в настройках указывается только URL админки `https://admin.example.com` (запросы к API идут с сервера админки как и в браузере).

## ngrok (временные URL для тестов)

1. Установите [ngrok](https://ngrok.com/download) и выполните `ngrok config add-authtoken <токен>`.
2. Запустите локально API, web и backoffice (или в Docker с пробросом портов).
3. В отдельных терминалах:
   ```bash
   ngrok http 4000 --domain=<ваш-поддомен-api>.ngrok-free.app
   ngrok http 3000 --domain=<ваш-поддомен-web>.ngrok-free.app
   ngrok http 3001 --domain=<ваш-поддомен-admin>.ngrok-free.app
   ```
   Зарезервированные поддомены доступны на платных планах; на бесплатном — три отдельных процесса с выданными URL.
4. Пропишите полученные HTTPS-URL в `CORS_ORIGINS`, `API_URL` / `BACKEND_API_URL` и в настройках десктоп-приложения.

Пример файла `ngrok.yml` (агент v2, один процесс):

```yaml
version: "2"
authtoken: ВАШ_ТОКЕН
tunnels:
  api:
    addr: 4000
    proto: http
  web:
    addr: 3000
    proto: http
  admin:
    addr: 3001
    proto: http
```

Запуск: `ngrok start --all`.

## Обновления десктопной админки

На сервере API (тот же домен, что у клиентов) задайте:

```env
DESKTOP_ADMIN_LATEST_VERSION=1.0.1
DESKTOP_ADMIN_DOWNLOAD_URL=https://.../Yanak.Admin.Setup.1.0.1.exe
DESKTOP_ADMIN_RELEASE_NOTES=Список изменений
# опционально:
DESKTOP_ADMIN_MIN_VERSION=1.0.0
```

Эндпоинт `GET /api/system/desktop-admin-update` отдаёт JSON для проверки версии. Выложите новый `.exe` по `DESKTOP_ADMIN_DOWNLOAD_URL` и поднимите `DESKTOP_ADMIN_LATEST_VERSION`.
