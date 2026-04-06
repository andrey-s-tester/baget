#!/usr/bin/env node
/**
 * Очистка заказов в БД и покупателей (customers.json + таблица Customer если есть)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  // Заказы: удаляем в правильном порядке (дочерние записи каскадно удалятся при onDelete: Cascade)
  const deletedOrders = await prisma.order.deleteMany({});
  console.log("Orders deleted:", deletedOrders.count);

  // Покупатели в БД (если модель Customer есть)
  if ("customer" in prisma && typeof prisma.customer?.deleteMany === "function") {
    const deletedCustomers = await prisma.customer.deleteMany({});
    console.log("Customers (DB) deleted:", deletedCustomers.count);
  }

  // Файл customers.json
  const path = join(__dirname, "..", "data", "customers.json");
  writeFileSync(path, "[]", "utf8");
  console.log("customers.json cleared");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
