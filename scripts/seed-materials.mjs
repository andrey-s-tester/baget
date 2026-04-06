import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_GLASS = [
  { code: "none", name: "Нет", pricePerM2: 0 },
  { code: "regular", name: "Обычное", pricePerM2: 2000 },
  { code: "matte", name: "Матовое", pricePerM2: 4500 },
  { code: "anti_glare", name: "Антиблик", pricePerM2: 21250 },
  { code: "acrylic", name: "Пластиковое", pricePerM2: 2200 }
];

const DEFAULT_BACKING = [
  { code: "none", name: "Нет", pricePerM2: 0, note: "" },
  { code: "cardboard", name: "Картон", pricePerM2: 875, note: "руб./м²" },
  { code: "foam5", name: "Пенокартон 5 мм", pricePerM2: 2571, note: "руб./м²" },
  { code: "stretch", name: "Натяжка вышивки", pricePerM2: null, note: "0.9 × (ширина + высота) см" },
  { code: "stretcher", name: "Подрамник", pricePerM2: null, note: "1.1 × (ширина + высота) см" }
];

async function main() {
  for (const g of DEFAULT_GLASS) {
    await prisma.glassType.upsert({
      where: { code: g.code },
      create: { code: g.code, name: g.name, pricePerM2: g.pricePerM2 },
      update: { name: g.name, pricePerM2: g.pricePerM2 }
    });
  }
  console.log(`Upserted ${DEFAULT_GLASS.length} glass types`);

  for (const b of DEFAULT_BACKING) {
    await prisma.backingType.upsert({
      where: { code: b.code },
      create: {
        code: b.code,
        name: b.name,
        pricePerM2: b.pricePerM2,
        note: b.note
      },
      update: {
        name: b.name,
        pricePerM2: b.pricePerM2,
        note: b.note
      }
    });
  }
  console.log(`Upserted ${DEFAULT_BACKING.length} backing types`);

  const matboard = await prisma.matboardType.findFirst();
  if (!matboard) {
    await prisma.matboardType.create({
      data: {
        name: "Паспарту",
        pricePerM2: 14552,
        note: "При включённом паспарту"
      }
    });
    console.log("Created default matboard type");
  }

  let pricingConfig = await prisma.pricingConfig.findFirst();
  if (!pricingConfig) {
    await prisma.pricingConfig.create({
      data: {
        frameWasteCoeff: 1.1,
        assemblyPrice: 750,
        minimalOrderPrice: 1500,
        matboardPricePerM2: 14552
      }
    });
    console.log("Created default pricing config");
  }

  console.log("Materials and pricing seed done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
