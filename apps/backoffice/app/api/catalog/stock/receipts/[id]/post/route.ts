import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type Params = { id: string };

export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const { id } = await ctx.params;
    const res = await fetch(
      `${API_BASE_URL}/api/catalog/stock/receipts/${encodeURIComponent(id)}/post`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: req.headers.get("cookie") || ""
        },
        body: await req.text().catch(() => "{}"),
        cache: "no-store"
      }
    );
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json; charset=utf-8" }
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
