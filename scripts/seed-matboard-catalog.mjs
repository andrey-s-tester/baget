import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const raw = await readFile("data/matboard-catalog.json", "utf8");
  const items = JSON.parse(raw);

  let upserted = 0;
  for (const item of items) {
    const sku = String(item.sku ?? `MAT-${Date.now()}-${upserted}`).trim();
    if (!sku) continue;

    await prisma.matboardProfile.upsert({
      where: { sku },
      create: {
        sku,
        name: String(item.name ?? "").trim() || "Паспарту",
        pricePerM2: Number(item.pricePerM2) || 14552,
        imageUrl: item.imageUrl ?? null,
        isActive: item.isActive !== false
      },
      update: {
        name: String(item.name ?? "").trim() || "Паспарту",
        pricePerM2: Number(item.pricePerM2) || 14552,
        imageUrl: item.imageUrl ?? null,
        isActive: item.isActive !== false
      }
    });
    upserted += 1;
  }

  console.log(`Upserted ${upserted} matboard profiles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
