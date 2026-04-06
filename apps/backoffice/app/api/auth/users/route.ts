import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/auth/users`, {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const upstream = await fetch(`${API_BASE_URL}/api/auth/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: req.headers.get("cookie") || ""
      },
      body,
      cache: "no-store"
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Auth service unavailable" }, { status: 503 });
  }
}
