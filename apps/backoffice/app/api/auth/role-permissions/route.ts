import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/auth/role-permissions`, {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") || ""
      },
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
    return NextResponse.json({ ok: false, message: "Auth service unavailable" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await req.text();
    const upstream = await fetch(`${API_BASE_URL}/api/auth/role-permissions`, {
      method: "PATCH",
      headers: {
        cookie: req.headers.get("cookie") || "",
        "content-type": req.headers.get("content-type") || "application/json"
      },
      body: payload,
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
    return NextResponse.json({ ok: false, message: "Auth service unavailable" }, { status: 503 });
  }
}
