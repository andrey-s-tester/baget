/**
 * Слушает :3001 во время `next build` в Docker, чтобы браузер не показывал ERR_EMPTY_RESPONSE.
 * Останавливается из docker-backoffice-start.sh перед `next start`.
 */
import http from "node:http";

const port = Number(process.env.PORT || process.env.BACKOFFICE_PORT || 3001);
const body = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Янак — админка</title></head>
<body style="font-family:system-ui,Segoe UI,sans-serif;padding:2rem;max-width:40rem;line-height:1.5;background:#0f1419;color:#e6edf3">
<h1 style="font-size:1.25rem">Сборка админки</h1>
<p>Идёт production-сборка Next.js в контейнере <code>yanak-backoffice</code>. Обычно 1–5 минут, затем эта страница сменится на приложение.</p>
<p style="opacity:.85">Логи: <code style="background:#1c2128;padding:.15rem .4rem;border-radius:4px">docker logs -f yanak-backoffice</code></p>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(503, {
    "Content-Type": "text/html; charset=utf-8",
    "Retry-After": "15",
    "Cache-Control": "no-store",
  });
  res.end(body);
});

server.listen(port, "0.0.0.0", () => {
  console.error(`[backoffice-placeholder] :${port} → 503 (идёт next build)`);
});
