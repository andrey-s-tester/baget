import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Employee = {
  id: string;
  name: string;
  role: string;
  store: string;
  isActive: boolean;
};

const PATH = join(process.cwd(), "..", "..", "data", "employees.json");

function load(): Employee[] {
  try {
    if (!existsSync(PATH)) return [];
    return JSON.parse(readFileSync(PATH, "utf8"));
  } catch {
    return [];
  }
}

function save(data: Employee[]) {
  writeFileSync(PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function GET() {
  return NextResponse.json(load());
}

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  const role = String(b.role ?? "").trim();
  const store = String(b.store ?? "").trim();
  if (!name) return NextResponse.json({ ok: false }, { status: 400 });

  const list = load();
  const emp: Employee = {
    id: `emp-${Date.now()}`,
    name,
    role: role || "Сотрудник",
    store,
    isActive: true
  };
  list.push(emp);
  save(list);
  return NextResponse.json({ ok: true, id: emp.id });
}

export async function DELETE(req: NextRequest) {
  const b = (await req.json()) as Record<string, unknown>;
  const id = String(b.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const list = load();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return NextResponse.json({ ok: false }, { status: 404 });
  list.splice(idx, 1);
  save(list);
  return NextResponse.json({ ok: true });
}
