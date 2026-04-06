import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function parseTarget(input: string | null): URL | null {
  if (!input) return null;
  try {
    const target = new URL(input);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target;
  } catch {
    return null;
  }
}

function placeholderSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#f1f5f9"/>
  <rect x="96" y="46" width="128" height="88" rx="8" fill="#e2e8f0"/>
  <path d="M112 118l30-34 24 22 18-18 24 30H112z" fill="#94a3b8"/>
  <circle cx="190" cy="74" r="9" fill="#cbd5e1"/>
  <text x="160" y="155" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="14" fill="#64748b">Нет фото</text>
</svg>`;
}

function placeholderResponse(): NextResponse {
  return new NextResponse(placeholderSvg(), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}

function isStrict(req: NextRequest): boolean {
  const s = req.nextUrl.searchParams.get("strict");
  return s === "1" || s === "true";
}

/** При strict ошибка upstream не маскируется под 200 — нужно для цепочки fallback в <img onError>. */
function failResponse(req: NextRequest, status: number) {
  if (isStrict(req)) {
    return new NextResponse(null, { status });
  }
  return placeholderResponse();
}

export async function GET(req: NextRequest) {
  const target = parseTarget(req.nextUrl.searchParams.get("url"));
  if (!target) return failResponse(req, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!upstream.ok) return failResponse(req, 502);
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const body = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    clearTimeout(timeout);
    return failResponse(req, 504);
  }
}

