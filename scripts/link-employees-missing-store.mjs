/**
 * Сотрудники без магазина (Employee.storeId = null) получают единственный активный магазин,
 * если в базе ровно один такой — удобно для локальной/dev среды.
 * При нескольких магазинах только пишет в консоль, ничего не меняет.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true }
  });
  if (stores.length === 0) {
    console.log("Нет активных магазинов — сначала создайте магазин в админке или сидом каталога.");
    return;
  }
  let only = stores[0];
  if (stores.length > 1) {
    if (process.env.LINK_TO_FIRST_STORE === "1") {
      only = stores[0];
      console.log(
        `Активных магазинов: ${stores.length}. LINK_TO_FIRST_STORE=1 — привязываю к первому по дате: «${only.name}».`
      );
    } else {
      console.log(
        `Активных магазинов: ${stores.length}. Автопривязка не выполняется — выберите магазин вручную в «Сотрудники», либо: LINK_TO_FIRST_STORE=1 node scripts/link-employees-missing-store.mjs`
      );
      return;
    }
  }
  const missing = await prisma.employee.findMany({
    where: { storeId: null },
    select: { id: true, userId: true, user: { select: { email: true } } }
  });
  if (missing.length === 0) {
    console.log("Все сотрудники уже с магазином.");
    return;
  }
  const r = await prisma.employee.updateMany({
    where: { storeId: null },
    data: { storeId: only.id }
  });
  console.log(`Привязано к «${only.name}» (${only.id}): ${r.count} сотрудник(ов).`);
  for (const e of missing) {
    console.log(`  - ${e.user?.email ?? e.userId}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
