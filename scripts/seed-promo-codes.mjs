import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  let raw;
  try {
    raw = await readFile("data/promo-codes.json", "utf8");
  } catch {
    console.log("data/promo-codes.json not found, skipping promo seed");
    return;
  }

  const items = JSON.parse(raw);
  for (const item of items) {
    const code = String(item.code ?? "").trim().toUpperCase();
    if (!code) continue;

    await prisma.promoCode.upsert({
      where: { code },
      create: {
        code,
        discountPercent: item.discountPercent != null ? item.discountPercent : null,
        discountAmount: item.discountAmount != null ? item.discountAmount : null,
        isActive: item.isActive !== false
      },
      update: {
        discountPercent: item.discountPercent != null ? item.discountPercent : null,
        discountAmount: item.discountAmount != null ? item.discountAmount : null,
        isActive: item.isActive !== false
      }
    });
  }
  console.log(`Seeded ${items.length} promo codes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
