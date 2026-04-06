import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Как в backoffice: сначала BACKEND_API_URL, чтобы витрина и админка смотрели в один Nest. */
const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_URL ||
  process.env.BACKOFFICE_URL ||
  "http://localhost:4000";

async function proxy(
  method: string,
  search: string,
  req: NextRequest,
  body?: string
) {
  const url = `${API_BASE_URL}/api/catalog/frames${search}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          cookie: req.headers.get("cookie") || ""
        },
        body: method === "GET" ? undefined : body,
        cache: "no-store"
      });
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "application/json" }
      });
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.search ? `?${req.nextUrl.searchParams.toString()}` : "";
    return proxy("GET", search, req);
  } catch {
    // 200 + [] — иначе клиент при !ok не парсит тело и остаётся пустой каталог без явной ошибки сети.
    return NextResponse.json([], { status: 200 });
  }
}
