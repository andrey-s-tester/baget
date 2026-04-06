import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
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
    return NextResponse.json([], { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.text();
    return proxy("PATCH", "", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    return proxy("POST", "", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.text();
    return proxy("DELETE", "", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
