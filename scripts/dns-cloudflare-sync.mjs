#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Подхватывает .env из корня, если есть (без перезаписи уже заданных переменных). */
function loadDotEnv() {
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
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

/**
 * Синхронизирует A-записи в Cloudflare с заданным IPv4 (или авто-определение публичного IP).
 * Нужен токен с правом Zone → DNS → Edit. Зона должна использовать NS Cloudflare.
 *
 * Переменные окружения:
 *   CLOUDFLARE_API_TOKEN   — API Token (не Global API Key)
 *   CLOUDFLARE_ZONE_ID     — ID зоны (дашборд → домен → справа внизу), ИЛИ
 *   CLOUDFLARE_ZONE_NAME   — например bagetnaya-yanak.ru (зона найдётся по API)
 *   TARGET_IPV4            — IP сервера, или "auto" / флаг --detect-public (api.ipify.org)
 *   DNS_A_RECORDS          — через запятую FQDN; по умолчанию как в deploy/Caddyfile
 *   CLOUDFLARE_DNS_PROXIED — "1" или "0" (оранжевое облако). По умолчанию 1.
 *
 * Запуск: npm run dns:cf-sync
 * Проверка без записи: node scripts/dns-cloudflare-sync.mjs --dry-run
 */

const CF = 'https://api.cloudflare.com/client/v4';

const DEFAULT_HOSTS = [
  'bagetnaya-yanak.ru',
  'www.bagetnaya-yanak.ru',
  'api.bagetnaya-yanak.ru',
  'admin.bagetnaya-yanak.ru',
];

function parseHosts() {
  const raw = process.env.DNS_A_RECORDS;
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [...DEFAULT_HOSTS];
}

function proxied() {
  const v = (process.env.CLOUDFLARE_DNS_PROXIED ?? '1').trim();
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

async function getPublicIpv4() {
  const r = await fetch('https://api.ipify.org?format=json');
  if (!r.ok) throw new Error(`ipify: ${r.status}`);
  const { ip } = await r.json();
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    throw new Error(`ipify: unexpected response ${JSON.stringify({ ip })}`);
  }
  return ip;
}

async function cf(token, path, init = {}) {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.length
      ? data.errors.map((e) => e.message || JSON.stringify(e)).join('; ')
      : res.statusText || `HTTP ${res.status}`;
    throw new Error(`Cloudflare API ${path}: ${msg}`);
  }
  return data.result;
}

async function resolveZoneId(token) {
  const id = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (id) return id;
  const name = process.env.CLOUDFLARE_ZONE_NAME?.trim();
  if (!name) {
    throw new Error('Задайте CLOUDFLARE_ZONE_ID или CLOUDFLARE_ZONE_NAME');
  }
  const zones = await cf(token, `/zones?name=${encodeURIComponent(name)}`);
  if (!zones?.length) {
    throw new Error(`Зона не найдена: ${name}`);
  }
  return zones[0].id;
}

async function listARecords(token, zoneId, fqdn) {
  const q = new URLSearchParams({ type: 'A', name: fqdn });
  return cf(token, `/zones/${zoneId}/dns_records?${q}`);
}

async function upsertA(token, zoneId, fqdn, content, useProxy, dryRun) {
  const existing = await listARecords(token, zoneId, fqdn);
  const body = {
    type: 'A',
    name: fqdn,
    content,
    ttl: 1,
    proxied: useProxy,
  };
  if (existing.length > 1) {
    console.warn(`[warn] ${fqdn}: найдено ${existing.length} A-записей, обновляю первую`);
  }
  const rec = existing[0];
  if (!rec) {
    if (dryRun) {
      console.log(`[dry-run] создать A ${fqdn} → ${content} proxied=${useProxy}`);
      return;
    }
    await cf(token, `/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    console.log(`[ok] создано A ${fqdn} → ${content}`);
    return;
  }
  if (rec.content === content && rec.proxied === useProxy) {
    console.log(`[skip] ${fqdn} уже ${content} proxied=${useProxy}`);
    return;
  }
  if (dryRun) {
    console.log(
      `[dry-run] обновить A ${fqdn}: ${rec.content} → ${content} proxied=${useProxy}`,
    );
    return;
  }
  await cf(token, `/zones/${zoneId}/dns_records/${rec.id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  console.log(`[ok] обновлено A ${fqdn} → ${content}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    console.error('Нужен CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }

  let ip = process.env.TARGET_IPV4?.trim();
  if (!ip || ip === 'auto' || process.argv.includes('--detect-public')) {
    console.log('Определение публичного IPv4 (ipify)...');
    ip = await getPublicIpv4();
    console.log(`Публичный IP: ${ip}`);
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    console.error(`Некорректный TARGET_IPV4: ${ip}`);
    process.exit(1);
  }

  const zoneId = await resolveZoneId(token);
  const hosts = parseHosts();
  const useProxy = proxied();

  console.log(
    `Зона ${zoneId}, записей: ${hosts.length}, IP: ${ip}, proxied: ${useProxy}${dryRun ? ' (dry-run)' : ''}`,
  );

  for (const fqdn of hosts) {
    await upsertA(token, zoneId, fqdn, ip, useProxy, dryRun);
  }

  console.log('Готово. Подождите 1–5 минут на распространение DNS.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
