import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const upstream = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body,
      cache: "no-store"
    });
    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }
    return response;
  } catch {
    return NextResponse.json({ ok: false, message: "Auth service unavailable" }, { status: 503 });
  }
}
