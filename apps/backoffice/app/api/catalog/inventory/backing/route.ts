import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.search ? `?${req.nextUrl.searchParams.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/api/catalog/inventory/backing${search}`, {
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
