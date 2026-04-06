import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.toString();
    const res = await fetch(`${API_BASE_URL}/api/catalog/stock/receipts${q ? `?${q}` : ""}`, {
      method: "GET",
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store"
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json; charset=utf-8" }
    });
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/catalog/stock/receipts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: req.headers.get("cookie") || ""
      },
      body: await req.text(),
      cache: "no-store"
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json; charset=utf-8" }
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
