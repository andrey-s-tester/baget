#!/usr/bin/env node
/**
 * Проверка .env перед подъёмом стека с Caddy (compose:domain).
 * Не печатает секреты.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) {
    console.error("Нет файла .env в корне проекта.");
    process.exit(1);
  }
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let v = s.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}

loadDotEnv();

const pub = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
const cors = process.env.CORS_ORIGINS?.trim() ?? "";
const cookie = process.env.COOKIE_SECURE?.trim() ?? "0";

let failed = false;

if (!pub.startsWith("https://")) {
  console.error(
    "NEXT_PUBLIC_API_BASE_URL должен быть публичным HTTPS URL API, например https://api.bagetnaya-yanak.ru",
  );
  failed = true;
}

if (!cors) {
  console.error(
    "CORS_ORIGINS пуст: укажите через запятую https://витрина, https://www.…, https://admin.…",
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

const needsWww =
  cors.includes("bagetnaya-yanak.ru") &&
  !cors.includes("www.bagetnaya-yanak.ru") &&
  !cors.includes("https://www.");
if (needsWww) {
  console.warn(
    "[warn] В CORS нет https://www.bagetnaya-yanak.ru — витрина по www может не ходить в API.",
  );
}

if (cors.includes("https://") && cookie !== "1") {
  console.warn(
    "[warn] COOKIE_SECURE=1 нужен для входа в админку по HTTPS (см. .env.example).",
  );
}

console.log("Проверка .env для домена: OK.");
console.log(
  "Дальше: DNS A-записи на IP сервера → npm run dns:cf-sync | порты 80/443 | npm run compose:domain",
);
process.exit(0);
