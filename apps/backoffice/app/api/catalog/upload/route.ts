import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function toSafeSku(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
}

function resolveFileName(sku: string, kind: "catalog" | "preview", fileName: string): string {
  const ext = (fileName.split(".").pop() || "jpg").toLowerCase();
  const normalizedExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  return kind === "preview" ? `${sku}t.${normalizedExt}` : `${sku}.${normalizedExt}`;
}

function saveToTargets(fileName: string, bytes: Uint8Array) {
  const targets = [
    join(process.cwd(), "public", "baget-assets"),
    join(process.cwd(), "..", "web", "public", "baget-assets")
  ];
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), bytes);
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const skuRaw = String(formData.get("sku") ?? "");
    const kindRaw = String(formData.get("kind") ?? "catalog");
    const file = formData.get("file");
    const sku = toSafeSku(skuRaw);
    const kind = kindRaw === "preview" ? "preview" : "catalog";

    if (!sku) {
      return NextResponse.json({ ok: false, message: "Нужен SKU" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Файл не передан" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, message: "Разрешены JPG/PNG/WEBP/GIF" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const fileName = resolveFileName(sku, kind, file.name);
    saveToTargets(fileName, bytes);

    return NextResponse.json({
      ok: true,
      url: `/baget-assets/${fileName}`
    });
  } catch (e) {
    console.error("[backoffice catalog] upload", e);
    return NextResponse.json({ ok: false, message: "Ошибка загрузки файла" }, { status: 500 });
  }
}
