import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

async function proxy(method: string, search: string, req: NextRequest, body?: string) {
  const url = `${API_BASE_URL}/api/products${search}`;
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
}

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search ? `?${req.nextUrl.searchParams.toString()}` : "";
  try {
    return await proxy("GET", search, req);
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await proxy("POST", "", req, await req.text());
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await proxy("PATCH", "", req, await req.text());
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    return await proxy("DELETE", "", req, await req.text());
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
