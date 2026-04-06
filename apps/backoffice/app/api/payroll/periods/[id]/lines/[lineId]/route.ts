import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id, lineId } = await ctx.params;
    const upstream = await fetch(
      `${API_BASE_URL}/api/payroll/periods/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`,
      {
        method: "DELETE",
        headers: { cookie: req.headers.get("cookie") || "" },
        cache: "no-store"
      }
    );
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json({ ok: false, message: "API unavailable" }, { status: 503 });
  }
}
