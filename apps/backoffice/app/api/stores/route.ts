import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

async function proxy(
  path: string,
  req: NextRequest,
  options: { method: string; body?: string }
) {
  const upstream = await fetch(`${API_BASE_URL}/api/stores${path}`, {
    method: options.method,
    headers: {
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || ""
    },
    body: options.body,
    cache: "no-store"
  });
  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") || "application/json; charset=utf-8"
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/stores`, {
      method: "GET",
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store"
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ||
          "application/json; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "API unavailable" },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    return proxy("", req, { method: "POST", body });
  } catch {
    return NextResponse.json(
      { ok: false, message: "API unavailable" },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.text();
    return proxy("", req, { method: "PATCH", body });
  } catch {
    return NextResponse.json(
      { ok: false, message: "API unavailable" },
      { status: 503 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const b = (await req.json()) as { id?: string };
    const id = String(b?.id ?? "").trim();
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    const upstream = await fetch(`${API_BASE_URL}/api/stores/${id}`, {
      method: "DELETE",
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store"
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ||
          "application/json; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "API unavailable" },
      { status: 503 }
    );
  }
}
