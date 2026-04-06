# Web (Next.js)

## Запуск

Из корня монорепозитория:

```bash
npm run catalog:sync-web   # скопировать data/baget-catalog.json → apps/web/lib/
npm run dev:web            # из корня репозитория — только клиент на :3000
```

Открой http://localhost:3000

Если браузер пишет **ERR_CONNECTION_REFUSED** — сервер не запущен: оставь терминал открытым с `npm run dev:web`, дождись строки `Ready`.

Каталог для API (`/api/catalog/frames`) берётся из **`lib/baget-catalog.json`** (вшивается в сборку), отдельный `cwd` не нужен.

## Если видишь «Internal Server Error» (чёрный / белый экран)

Такой ответ часто **не от Next**, а от **другого процесса на порту 3000** (старый Node, Docker, другой сервер).

1. Проверь, кто слушает порт (PowerShell):  
   `netstat -ano | findstr :3000`  
   Заверши лишний процесс или запусти web на другом порту:  
   `npx next dev -p 3010` (из каталога `apps/web`).
2. Запускай **только** клиент: `npm run dev -w apps/web` из **корня репозитория**, а не несколько `next dev` сразу на один порт.
3. Очисти кэш и пересобери: в `apps/web` удали папку `.next`, затем снова `npm run dev -w apps/web`.
4. В `next.config` отключён **typedRoutes** — после смены конфига кэш `.next` лучше удалить.

## Продакшен

```bash
npm run build -w apps/web
npm run start -w apps/web
```

Перед `build` должен существовать **`apps/web/lib/baget-catalog.json`** (через `catalog:sync-web` или коммит файла).
