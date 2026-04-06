import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const raw = await readFile("data/baget-optom-catalog.json", "utf8");
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) {
    throw new Error("data/baget-optom-catalog.json must be an array");
  }

  let upserted = 0;
  for (const item of items) {
    const sku = String(item.sku ?? "").trim();
    if (!sku) continue;
    const retail = Math.max(0, Math.round(Number(item.retailPriceMeter) || 0) || 5000);
    const category = item.category === "wood" || item.category === "aluminum" ? item.category : "plastic";
    await prisma.frameProfile.upsert({
      where: { sku },
      create: {
        sku,
        name: String(item.name ?? sku).trim() || sku,
        category,
        catalogSource: "baget_optom_ua",
        widthMm: Math.max(1, Math.round(Number(item.widthMm) || 50)),
        widthWithoutQuarterMm:
          item.widthWithoutQuarterMm != null ? Math.round(Number(item.widthWithoutQuarterMm)) : null,
        purchasePrice: Number((retail * 0.55).toFixed(2)),
        retailPriceMeter: retail,
        imageUrl: item.imageUrl ? String(item.imageUrl) : null,
        previewImageUrl: item.previewImageUrl ? String(item.previewImageUrl) : item.imageUrl ? String(item.imageUrl) : null,
        isActive: item.isActive !== false
      },
      update: {
        name: String(item.name ?? sku).trim() || sku,
        category,
        catalogSource: "baget_optom_ua",
        widthMm: Math.max(1, Math.round(Number(item.widthMm) || 50)),
        widthWithoutQuarterMm:
          item.widthWithoutQuarterMm != null ? Math.round(Number(item.widthWithoutQuarterMm)) : null,
        retailPriceMeter: retail,
        imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
        previewImageUrl: item.previewImageUrl ? String(item.previewImageUrl) : item.imageUrl ? String(item.imageUrl) : undefined,
        isActive: item.isActive !== false
      }
    });
    upserted += 1;
  }

  console.log(`Upserted ${upserted} frame profiles from baget-optom (catalogSource=baget_optom_ua)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
