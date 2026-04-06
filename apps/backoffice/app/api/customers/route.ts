import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

async function forward(
  req: NextRequest,
  method: "GET" | "POST",
  body?: string
) {
  const url = new URL(req.url);
  const apiUrl = `${API_BASE_URL}/api/customers${url.search}`;
  const upstream = await fetch(apiUrl, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || "",
    },
    body: method === "GET" ? undefined : body,
    cache: "no-store",
  });
  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ||
        "application/json; charset=utf-8",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return forward(req, "GET");
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
    return forward(req, "POST", body);
  } catch {
    return NextResponse.json(
      { ok: false, message: "API unavailable" },
      { status: 503 }
    );
  }
}
