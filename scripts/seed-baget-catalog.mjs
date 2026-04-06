import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categoryMap = {
  plastic: "plastic",
  wood: "wood",
  aluminum: "aluminum"
};

async function main() {
  const raw = await readFile("data/baget-catalog.json", "utf8");
  const items = JSON.parse(raw);

  let upserted = 0;
  for (const item of items) {
    await prisma.frameProfile.upsert({
      where: { sku: item.sku },
      create: {
        sku: item.sku,
        name: item.name,
        category: categoryMap[item.category] ?? "wood",
        catalogSource: "bagetnaya_masterskaya",
        widthMm: item.widthMm,
        widthWithoutQuarterMm: item.widthWithoutQuarterMm ?? null,
        purchasePrice: Number((item.retailPriceMeter * 0.55).toFixed(2)),
        retailPriceMeter: item.retailPriceMeter,
        imageUrl: item.imageUrl,
        previewImageUrl: item.previewImageUrl ?? null,
        isActive: item.isActive ?? true
      },
      update: {
        name: item.name,
        category: categoryMap[item.category] ?? "wood",
        catalogSource: "bagetnaya_masterskaya",
        widthMm: item.widthMm,
        widthWithoutQuarterMm: item.widthWithoutQuarterMm ?? null,
        retailPriceMeter: item.retailPriceMeter,
        imageUrl: item.imageUrl,
        previewImageUrl: item.previewImageUrl ?? null,
        isActive: item.isActive ?? true
      }
    });
    upserted += 1;
  }

  const exists = await prisma.store.findFirst({ where: { name: "Арбатская" } });
  if (!exists) {
    await prisma.store.createMany({
      data: [
        { name: "Арбатская", address: "Москва, ул. Арбат, 1", phone: "8 (926) 865-92-95" },
        { name: "Новокузнецкая", address: "Климентовский переулок, 6", phone: "8 (977) 824-42-12" },
        { name: "Баррикадная", address: "Баррикадная 21/34с3", phone: "8 (977) 314-77-71" }
      ]
    });
  }

  console.log(`Upserted ${upserted} frame profiles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
