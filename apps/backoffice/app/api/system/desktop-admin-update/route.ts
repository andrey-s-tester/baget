import { NextResponse } from "next/server";

const API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

/** Прокси к Nest: публичный манифест обновлений десктопа (для страницы «Обновления» в backoffice). */
export async function GET() {
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/system/desktop-admin-update`, {
      cache: "no-store"
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json({ ok: false, message: "API недоступен" }, { status: 503 });
  }
}
