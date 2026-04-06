import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

async function forward(method: string, path: string, req: NextRequest, body?: string) {
  const res = await fetch(`${API_BASE_URL}/api/pricing${path}`, {
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
  try {
    return forward("GET", "", req);
  } catch {
    return NextResponse.json(
      {
        frameWasteCoeff: 1.1,
        assemblyPrice: 750,
        minimalOrderPrice: 1500,
        matboardPricePerM2: 14552,
        glassPrices: [],
        backingPrices: []
      },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.text();
    return forward("PATCH", "", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
