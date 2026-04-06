/**
 * Копирует каталог и фото в backoffice для standalone-работы.
 * Запуск: npm run catalog:sync-backoffice
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 1. Каталог JSON
const catalogSrc = join(root, "data", "baget-catalog.json");
const catalogDst = join(root, "apps", "backoffice", "lib", "baget-catalog.json");
if (existsSync(catalogSrc)) {
  mkdirSync(join(root, "apps", "backoffice", "lib"), { recursive: true });
  copyFileSync(catalogSrc, catalogDst);
  console.log("OK catalog -> apps/backoffice/lib/baget-catalog.json");
} else {
  console.warn("Skip: data/baget-catalog.json not found");
}

// 2. Магазины JSON
const storesSrc = join(root, "data", "stores.json");
const storesDst = join(root, "apps", "backoffice", "lib", "stores.json");
if (existsSync(storesSrc)) {
  mkdirSync(join(root, "apps", "backoffice", "lib"), { recursive: true });
  copyFileSync(storesSrc, storesDst);
  console.log("OK stores -> apps/backoffice/lib/stores.json");
} else {
  console.warn("Skip: data/stores.json not found");
}

// 3. Фото baget-assets (если есть в web)
const assetsSrc = join(root, "apps", "web", "public", "baget-assets");
const assetsDst = join(root, "apps", "backoffice", "public", "baget-assets");
if (existsSync(assetsSrc)) {
  mkdirSync(assetsDst, { recursive: true });
  const files = readdirSync(assetsSrc);
  let n = 0;
  for (const f of files) {
    copyFileSync(join(assetsSrc, f), join(assetsDst, f));
    n++;
  }
  console.log(`OK ${n} images -> apps/backoffice/public/baget-assets/`);
} else {
  console.warn("Skip: apps/web/public/baget-assets not found. Run catalog:download-images first.");
}
