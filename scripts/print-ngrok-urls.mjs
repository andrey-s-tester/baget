#!/usr/bin/env node
/**
 * Публичные URL активных туннелей (локальный инспектор ngrok :4040).
 * Использование: npm run ngrok:urls
 */
try {
  const r = await fetch("http://127.0.0.1:4040/api/tunnels");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const tunnels = j.tunnels ?? [];
  if (tunnels.length === 0) {
    console.log("Туннелей пока нет. Подождите несколько секунд и повторите: npm run ngrok:urls\n");
    process.exit(0);
  }
  console.log("");
  console.log("Публичные ссылки ngrok (скопируйте public_url):");
  for (const t of tunnels) {
    const name = (t.name ?? "?") + ":";
    console.log(`  ${name.padEnd(18)} ${t.public_url}`);
  }
  console.log("");
  console.log("Веб-инспектор: http://localhost:4040");
  console.log("");
} catch {
  console.error("Инспектор ngrok недоступен (http://127.0.0.1:4040).");
  console.error("1) В .env задайте NGROK_AUTHTOKEN (https://dashboard.ngrok.com/get-started/your-authtoken)");
  console.error("2) Запустите: npm run ngrok:up");
  console.error("3) Снова: npm run ngrok:urls");
  process.exit(1);
}
