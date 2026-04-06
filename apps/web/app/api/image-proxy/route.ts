import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function parseTarget(urlParam: string | null): URL | null {
  if (!urlParam) return null;
  try {
    const target = new URL(urlParam);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target;
  } catch {
    return null;
  }
}

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="#f1f5f9"/><text x="60" y="50" text-anchor="middle" font-size="12" fill="#94a3b8" font-family="sans-serif">Нет фото</text></svg>`;

function placeholderResponse(): NextResponse {
  return new NextResponse(PLACEHOLDER_SVG, {
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

/** When strict, upstream errors must not return 200 (so <img> onerror / fallback chain works). */
function failResponse(req: NextRequest, status: number) {
  if (isStrict(req)) {
    return new NextResponse(null, { status });
  }
  return placeholderResponse();
}

async function proxy(req: NextRequest, method: "GET" | "HEAD") {
  const raw = req.nextUrl.searchParams.get("url");
  const target = parseTarget(raw);
  if (!target) return failResponse(req, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(target.toString(), {
      method,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!upstream.ok) return failResponse(req, 502);

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600"
    };
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers["Content-Length"] = contentLength;

    if (method === "HEAD") {
      return new NextResponse(null, { status: 200, headers });
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(body, { status: 200, headers });
  } catch {
    clearTimeout(timeout);
    return failResponse(req, 504);
  }
}

export async function GET(req: NextRequest) {
  return proxy(req, "GET");
}

export async function HEAD(req: NextRequest) {
  return proxy(req, "HEAD");
}

