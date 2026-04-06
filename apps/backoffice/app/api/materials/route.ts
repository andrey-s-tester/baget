import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

async function forward(method: string, req: NextRequest, body?: string) {
  const res = await fetch(`${API_BASE_URL}/api/materials`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || ""
    },
    body,
    cache: "no-store"
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
      "cache-control": "private, no-store, max-age=0, must-revalidate"
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    return forward("GET", req);
  } catch {
    return NextResponse.json(
      { matboard: { name: "Паспарту", pricePerM2: 14552, note: "" }, glass: [], backing: [] },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.text();
    return forward("PATCH", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    return forward("POST", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.text();
    return forward("DELETE", req, body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
