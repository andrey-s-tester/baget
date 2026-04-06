# Домен + Cloudflare на Windows

Linux-образы из `docker-compose.yml` на **Windows Server 2019** со штатным Docker Engine **не запускаются** (только Windows-контейнеры). Ниже два рабочих варианта «всё на Windows».

---

## Cloudflare Tunnel — если домен даёт **522** или провайдер режет порты 80/443

Пока с интернета **не доходят** пакеты до вашего сервера, **Caddy и A-записи не помогут**. Туннель ходит **наружу сам** (исходящее соединение), входящие порты **не нужны**.

### Что сделать (один раз)

1. Убедитесь, что на сервере запущены приложения: **API :4000**, витрина **:3000**, админка **:3001** (`npm run win:native:dev:*` или `start:*`).
2. Скачайте коннектор: в корне проекта **`npm run tunnel:win:download`** (появится `deploy/cloudflared/cloudflared.exe`).
3. В браузере: [Cloudflare Dashboard](https://one.dash.cloudflare.com/) → **Zero Trust** → **Networks** → **Tunnels** → создайте или откройте туннель (не путать с **Networks → Routes**: там поле **CIDR** для подсетей вроде `10.0.0.0/8`, туда **нельзя** вставлять `http://127.0.0.1:3000` — это другой продукт).
4. Имя, например `yanak`, далее на шаге **Install connector** скопируйте **весь** токен из команды вида `cloudflared tunnel run --token ЕДИНАЯ_ДЛИННАЯ_СТРОКА` — от первого `eyJ` до конца строки, **без** обрезки и **без** переноса на вторую строку в `.env`. Если в `.env` несколько строк `CLOUDFLARE_TUNNEL_TOKEN=`, скрипт берёт **самую длинную** — лишние короткие строки удалите. **Не путать** с **API Token** (`cfat_...`).
5. На сервере в файле **`.env`** одна строка **без кавычек**, токен **целиком** в одну строку:
   ```env
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjo...
   ```
6. В том же окне туннеля откройте **Public Hostname** и добавьте **четыре маршрута** (тип **HTTP**, без TLS до origin):

   | Поддомен / домен | URL сервиса |
   |------------------|-------------|
   | `bagetnaya-yanak.ru` | `http://127.0.0.1:3000` |
   | `www.bagetnaya-yanak.ru` | `http://127.0.0.1:3000` |
   | `api.bagetnaya-yanak.ru` | `http://127.0.0.1:4000` |
   | `admin.bagetnaya-yanak.ru` | `http://127.0.0.1:3001` |

   Если появляется ошибка **«An A, AAAA, or CNAME record with that host already exists»**: в **DNS → Records** **удалите** старые записи для **того же имени**, которое добавляете в туннель (часто это A на IP для `@`, и CNAME `api` / `admin` / `www` на корень). После удаления снова сохраните маршрут в **Public Hostname** — туннель создаст свои CNAME на `…cfargotunnel.com`. Для корня домена (`@`) Cloudflare подставит запись с учётом CNAME flattening.

   Кратко: **одно имя = одна запись**. Туннель и старые A/CNAME на одно имя **вместе не живут** — оставьте только то, что создаёт туннель.

7. Запуск коннектора — в PowerShell: `Set-Location D:\yanak` → `npm run tunnel:win:start`, окно **не закрывать**. В **Tunnels → ваш туннель → Overview** должен появиться **connector**, статус станет **HEALTHY** (не **INACTIVE**). Пустые **Connectors** = неверный/короткий токен, не тот туннель или процесс не запущен. Токен брать только из установки **этого же** туннеля (`bu` / ваше имя).

**502 Bad Gateway** в браузере при **HEALTHY** туннеле: Cloudflare доходит до коннектора, но **на сервере нет ответа от приложения**. Убедитесь, что запущены витрина **:3000**, API **:4000**, админка **:3001** (`npm run win:native:start:web` и т.д., см. ниже). На самом сервере в браузере откройте `http://127.0.0.1:3000` — страница должна открываться. В **Public Hostname** для корня домена укажите **`http://127.0.0.1:3000`**, тип **HTTP** (не **HTTPS** на localhost и не порт Caddy, если Caddy выключен). Быстрая проверка: `npm run tunnel:win:diagnose`.

**Важно (частая причина 502 на Windows):** в поле **Service** в **Published application routes** должно быть **`http://`**, не **`https://`**. Next/Nest на портах 3000/4000/3001 слушают **обычный HTTP** без сертификата. Если указать **`https://127.0.0.1:3000`**, cloudflared ждёт TLS на origin, рукопожатие падает → **502**. Интерфейс Cloudflare иногда подставляет HTTPS — вручную замените на **`http://127.0.0.1:3000`** (и то же для API/админки).

**Также:** в URL **нельзя** писать `http://localhost:3000` (и то же для `:4000` / `:3001`). На Windows `localhost` часто резолвится в **IPv6 (`::1`)**, а Node слушает **только IPv4** — используйте **`http://127.0.0.1:…`**. После смены маршрута подождите ~1 минуту и обновите сайт.

**Caddy для публикации через туннель не обязателен** (HTTPS до посетителей делает Cloudflare). Можно остановить Caddy, чтобы не путать.

**Служба Windows** (чтобы туннель жил после выхода из PowerShell): в `.env` должен быть **`CLOUDFLARE_TUNNEL_TOKEN`**, затем **PowerShell от имени администратора**:

```powershell
Set-Location D:\yanak
npm run tunnel:win:install-service
```

(Скрипт читает токен из `.env`, выполняет `cloudflared service install` и `sc start cloudflared`.) Если служба не создаётся — проверьте, что окно PowerShell **запущено от администратора**.

Вручную из **cmd от администратора**:

```bat
cd /d D:\yanak\deploy\cloudflared
cloudflared.exe service install ВАШ_ТОКЕН
sc start cloudflared
```

Удаление службы: `cloudflared.exe service uninstall` (из каталога с exe).

---

## Общее для Cloudflare

- A-записи `@`, `www`, `api`, `admin` → **публичный IP**, с которого в интернет выходят ваши 80/443 (часто IP роутера + проброс портов на сервер).
- Режим **SSL/TLS → Full (strict)**.
- Синхронизация A-записей из `.env`: `npm run dns:cf-sync` (см. `.env.example`).

---

## Вариант 1 (рекомендуется): Hyper-V + Ubuntu, внутри — ваш Docker

1. Включите роль **Hyper-V**, создайте ВМ **Ubuntu Server 22.04**, 4+ ГБ ОЗУ, диск 30+ ГБ.
2. Виртуальный коммутатор **внешний (External)** — чтобы ВМ была в той же сети, что и сервер (свой IP в LAN).
3. На Ubuntu: Docker + Compose, клон репозитория, `.env` как в `deploy/SERVER.md`, затем:
   `docker compose --profile https up -d`  
   (тот же Caddy и `deploy/Caddyfile`, что и на Linux.)
4. На **роутере**: проброс **TCP 80 и 443** на **IP этой ВМ** (если белый IP на роутере) или на IP Windows-хоста, если дальше проброс на ВМ (см. ниже).
5. Если в интернет смотрит только Windows-хост, а ВМ в NAT — используйте проброс портов на Hyper-V (вручную или скрипт) или поставьте **Caddy на Windows** по варианту 2, но с `reverse_proxy` на **IP ВМ:3000 / :4000 / :3001** вместо `127.0.0.1`.

Так вы не боретесь с Linux-образами на самом Windows — они крутятся в Linux-ВМ, домен и Cloudflare настраиваются как обычно.

---

## Вариант 2: Без виртуалки — всё процессами на Windows

Подходит, если на сервере **не** используете Docker для приложения.

### 1. Софт

- **PostgreSQL** и **Redis** (Redis: [Memurai](https://www.memurai.com/), портируемый дистрибутив Redis или отдельная ВМ).
- **Node.js 20+**, в корне репозитория: `npm install`.

### 2. `.env` (корень проекта)

| Переменная | Пример |
|------------|--------|
| `DATABASE_URL` | строка подключения к Postgres на этом же Windows (localhost) |
| `REDIS_URL` | `redis://127.0.0.1:6379` (если Redis локально) |
| `CORS_ORIGINS` | `https://bagetnaya-yanak.ru,https://www.bagetnaya-yanak.ru,https://admin.bagetnaya-yanak.ru` |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.bagetnaya-yanak.ru` |
| `BACKEND_API_URL` | `http://127.0.0.1:4000` — админка на сервере ходит в Nest напрямую (проще, чем через публичный URL) |
| `COOKIE_SECURE` | `1` |
| `CADDY_EMAIL` | почта для Let’s Encrypt |

Не используйте для этого сценария обычные `npm run dev:web` / `dev:backoffice` / `dev -w apps/api`: они подмешивают `config/env.local-dev.env` и сбрасывают прод-домены. Для домена — команды **`win:native:dev:*`** ниже.

### 3. База

Один раз: `npx prisma migrate deploy --schema=prisma/schema.prisma`, при необходимости сиды (`npm run db:seed`, `npm run auth:seed` — см. `deploy/SERVER.md`).

### 4. Запуск приложения

**Разработка / быстрый старт** (три окна PowerShell из корня `D:\yanak`):

```powershell
Set-Location D:\yanak
npm run win:native:dev:api
```

```powershell
Set-Location D:\yanak
npm run win:native:dev:web
```

```powershell
Set-Location D:\yanak
npm run win:native:dev:backoffice
```

**Продакшен-сборка** (после правок `.env` с публичными URL):

```powershell
Set-Location D:\yanak
npm run win:native:build
```

Затем три окна:

```powershell
npm run win:native:start:api
npm run win:native:start:web
npm run win:native:start:backoffice
```

API и Next уже слушают **0.0.0.0** на портах **4000**, **3000**, **3001**.

### 5. Caddy на Windows

1. Скачайте [Caddy для Windows](https://caddyserver.com/docs/install#windows).
2. Освободите **80/443** (остановите **IIS**, если занял порты).
3. Из корня репозитория:

```bat
set CADDY_EMAIL=postmaster@bagetnaya-yanak.ru
caddy run --config deploy\Caddyfile.windows-host
```

Файл **`deploy/Caddyfile.windows-host`** проксирует на `127.0.0.1:3000`, `:4000`, `:3001`.

### 6. Cloudflare и роутер

Как в разделе «Общее» выше: A-записи, **Full (strict)**, проброс **80/443** на этот ПК.

---

## Проброс с роутера

Пока порты **80/443** не доходят до машины с Caddy, Cloudflare и домен «не заведутся». Проверьте у провайдера: белый IP, проброс на нужный хост (Windows или ВМ).

---

## Кратко

| Цель                         | Что делать                                      |
|-----------------------------|--------------------------------------------------|
| Меньше боли с контейнерами  | Вариант 1: Ubuntu в Hyper-V + ваш `docker compose` |
| Совсем без Linux            | Вариант 2: Postgres + Redis + Node + Caddy на Windows |

Файл **`deploy/Caddyfile.windows-host`** — TLS и имена хостов к **localhost**; для прокси на ВМ замените `127.0.0.1` на IP виртуалки.
