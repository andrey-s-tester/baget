import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const REMOTE_BASE = "https://bagetnaya-masterskaya.com/bi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const PER_FETCH_MS = 2800;
const MEM_CACHE_TTL_MS = 4 * 60 * 1000;
const MEM_CACHE_MAX = 400;

type MemEntry = { buf: Buffer; contentType: string; expires: number };
const resolvedRasterMemCache = new Map<string, MemEntry>();

function memCacheKey(sku: string, p?: string, s?: string, strip?: boolean): string {
  return `${sku}\0${p ?? ""}\0${s ?? ""}\0${strip ? "1" : ""}`;
}

function memCacheGet(key: string): { buf: Buffer; contentType: string } | null {
  const e = resolvedRasterMemCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    resolvedRasterMemCache.delete(key);
    return null;
  }
  return { buf: e.buf, contentType: e.contentType };
}

function memCacheSet(key: string, buf: Buffer, contentType: string) {
  while (resolvedRasterMemCache.size >= MEM_CACHE_MAX) {
    const first = resolvedRasterMemCache.keys().next().value;
    if (first === undefined) break;
    resolvedRasterMemCache.delete(first);
  }
  resolvedRasterMemCache.set(key, { buf, contentType, expires: Date.now() + MEM_CACHE_TTL_MS });
}

function isValidSku(sku: string): boolean {
  if (sku.length < 1 || sku.length > 120) return false;
  if (/[\s<>"'`]/.test(sku)) return false;
  return true;
}

function extraAllowedHosts(): Set<string> {
  return new Set(
    (process.env.ALLOWED_FRAME_IMAGE_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function allowUrl(u: string): boolean {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase();
    const okHost =
      h === "bagetnaya-masterskaya.com" ||
      h === "www.baget-optom.com.ua" ||
      h === "baget-optom.com.ua" ||
      h === "svitart.net" ||
      h === "www.svitart.net" ||
      h === "localhost" ||
      h === "127.0.0.1" ||
      h.endsWith(".localhost") ||
      extraAllowedHosts().has(h);
    return (x.protocol === "https:" || x.protocol === "http:") && okHost;
  } catch {
    return false;
  }
}

function localBagetRoots(): string[] {
  return [
    path.join(process.cwd(), "apps", "web", "public", "baget-assets"),
    path.join(process.cwd(), "public", "baget-assets"),
    path.join(process.cwd(), "..", "web", "public", "baget-assets"),
    path.join(process.cwd(), "..", "..", "apps", "web", "public", "baget-assets"),
  ];
}

async function tryLocalJpeg(sku: string): Promise<{ buf: Buffer; contentType: string } | null> {
  /** Сначала текстура полосы (превью рамы), иначе каталожный .jpg даёт «плитку» на canvas. */
  const names = [`${sku}t.jpg`, `${sku}.jpg`];
  for (const root of localBagetRoots()) {
    for (const n of names) {
      const fp = path.join(root, n);
      try {
        const buf = await fs.readFile(fp);
        if (buf.length > 80) return { buf, contentType: "image/jpeg" };
      } catch {
        /* next */
      }
    }
  }
  return null;
}

function isStripTextureUrl(u: string): boolean {
  try {
    return /t\.(jpe?g|webp|png)$/i.test(new URL(u).pathname);
  } catch {
    return /t\.(jpe?g|webp|png)$/i.test(u.split("?")[0] || "");
  }
}

async function tryLocalStripOnly(sku: string): Promise<{ buf: Buffer; contentType: string } | null> {
  const name = `${sku}t.jpg`;
  for (const root of localBagetRoots()) {
    const fp = path.join(root, name);
    try {
      const buf = await fs.readFile(fp);
      if (buf.length > 80) return { buf, contentType: "image/jpeg" };
    } catch {
      /* next */
    }
  }
  return null;
}

async function resolveStripTexture(
  sku: string,
  p?: string,
  s?: string
): Promise<{ buf: Buffer; contentType: string } | null> {
  if (s && allowUrl(s) && isStripTextureUrl(s)) {
    const g = await fetchOneImage(s);
    if (g) return g;
  }
  if (p && allowUrl(p) && isStripTextureUrl(p)) {
    const g = await fetchOneImage(p);
    if (g) return g;
  }
  if (s && allowUrl(s)) {
    const g = await fetchOneImage(s);
    if (g) return g;
  }
  if (p && allowUrl(p)) {
    const g = await fetchOneImage(p);
    if (g) return g;
  }
  const local = await tryLocalStripOnly(sku);
  if (local) return local;
  return fetchOneImage(`${REMOTE_BASE}/${sku}t.jpg`);
}

async function fetchOneImage(url: string): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), PER_FETCH_MS);
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      next: { revalidate: 86_400 },
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 80) return null;
    return { buf, contentType: ct.split(";")[0]?.trim() || "image/jpeg" };
  } catch {
    return null;
  }
}

async function fetchFirstImage(urls: string[]): Promise<{ buf: Buffer; contentType: string } | null> {
  for (const url of urls) {
    if (!url) continue;
    const got = await fetchOneImage(url);
    if (got) return got;
  }
  return null;
}

/**
 * URL из БД: сначала превью (s) — файл меньше, для сетки каталога быстрее и дешевле по трафику;
 * если нет — основной каталожный (p).
 */
async function fetchDbPrimarySecondary(p?: string, s?: string): Promise<{ buf: Buffer; contentType: string } | null> {
  if (!p && !s) return null;
  if (s && s !== p) {
    const fromS = await fetchOneImage(s);
    if (fromS) return fromS;
  }
  if (p) {
    const fromP = await fetchOneImage(p);
    if (fromP) return fromP;
  }
  if (s) return fetchOneImage(s);
  return null;
}

function placeholderSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="#f1f5f9"/><text x="60" y="50" text-anchor="middle" font-size="12" fill="#94a3b8" font-family="sans-serif">Нет фото</text></svg>`;
}

/**
 * Один запрос с клиента: сервер по очереди пробует URL из БД и стандартные bi/{sku}.jpg,
 * затем локальные файлы — без цепочки img onError (быстрее сетка каталога).
 */
export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get("sku")?.trim() || "";
  if (!isValidSku(sku)) {
    return new NextResponse(placeholderSvg(), {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
    });
  }

  const stripMode = req.nextUrl.searchParams.get("strip") === "1";
  const pRaw = req.nextUrl.searchParams.get("p")?.trim();
  const sRaw = req.nextUrl.searchParams.get("s")?.trim();
  const p = pRaw && allowUrl(pRaw) ? pRaw : undefined;
  const s = sRaw && allowUrl(sRaw) ? sRaw : undefined;

  const mcKey = memCacheKey(sku, p, s, stripMode);
  const cached = memCacheGet(mcKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached.buf), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  }

  if (stripMode) {
    const gotStrip = await resolveStripTexture(sku, p, s);
    if (gotStrip) {
      memCacheSet(mcKey, gotStrip.buf, gotStrip.contentType);
      return new NextResponse(new Uint8Array(gotStrip.buf), {
        status: 200,
        headers: {
          "Content-Type": gotStrip.contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        },
      });
    }
    return new NextResponse(placeholderSvg(), {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
    });
  }

  let got = await fetchDbPrimarySecondary(p, s);
  if (!got) {
    const local = await tryLocalJpeg(sku);
    if (local) {
      memCacheSet(mcKey, local.buf, local.contentType);
      return new NextResponse(new Uint8Array(local.buf), {
        status: 200,
        headers: {
          "Content-Type": local.contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        },
      });
    }
    got = await fetchFirstImage([`${REMOTE_BASE}/${sku}t.jpg`, `${REMOTE_BASE}/${sku}.jpg`]);
  }

  if (got) {
    memCacheSet(mcKey, got.buf, got.contentType);
    return new NextResponse(new Uint8Array(got.buf), {
      status: 200,
      headers: {
        "Content-Type": got.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  }

  return new NextResponse(placeholderSvg(), {
    status: 200,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });
}
