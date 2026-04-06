import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

async function proxy(
  id: string,
  req: NextRequest,
  method: "PATCH" | "DELETE"
) {
  const body = method === "PATCH" ? await req.text() : undefined;
  const url = `${API_BASE_URL}/api/auth/users/${id}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        cookie: req.headers.get("cookie") || ""
      },
      body,
      cache: "no-store"
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: "Не удалось подключиться к API" },
      { status: 503 }
    );
  }
  const responseBody = await upstream.text();
  if (upstream.status === 404 && responseBody.includes("Cannot DELETE")) {
    return NextResponse.json(
      { ok: false, message: "Маршрут DELETE не найден. Перезапустите контейнер API." },
      { status: 502 }
    );
  }
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
    }
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    return proxy(id, req, "PATCH");
  } catch {
    return NextResponse.json({ ok: false, message: "Auth service unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    return proxy(id, _req, "DELETE");
  } catch {
    return NextResponse.json({ ok: false, message: "Auth service unavailable" }, { status: 503 });
  }
}
