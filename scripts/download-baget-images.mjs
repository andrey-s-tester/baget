/**
 * Скачивает JPG с сайта:
 * - apps/web/public/baget-assets/{sku}.jpg   — фото для каталога (как на сайте)
 * - apps/web/public/baget-assets/{sku}t.jpg — текстура для превью рамы
 * Пишет data/baget-assets-manifest.json (что скачалось / нет).
 *
 * Запуск: node scripts/download-baget-images.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const catalogPath = join(root, "data", "baget-catalog.json");
const webOutDir = join(root, "apps", "web", "public", "baget-assets");
const boOutDir = join(root, "apps", "backoffice", "public", "baget-assets");
const manifestPath = join(root, "data", "baget-assets-manifest.json");

async function main() {
  const raw = await readFile(catalogPath, "utf8");
  const items = JSON.parse(raw);
  await mkdir(webOutDir, { recursive: true });
  await mkdir(boOutDir, { recursive: true });

  const catalogAvailable = [];
  const catalogMissing = [];
  const previewAvailable = [];
  const previewMissing = [];

  let catalogOk = 0;
  let catalogFail = 0;
  let previewOk = 0;
  let previewFail = 0;
  const concurrency = 8;

  const previewUrl = (item) =>
    item.previewImageUrl ?? String(item.imageUrl).replace(/\.jpg$/i, "t.jpg");

  const queue = items.flatMap((item) => [
    { item, kind: "catalog" },
    { item, kind: "preview" }
  ]);

  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      const { item, kind } = job;
      const url = kind === "catalog" ? item.imageUrl : previewUrl(item);
      const webDest =
        kind === "catalog"
          ? join(webOutDir, `${item.sku}.jpg`)
          : join(webOutDir, `${item.sku}t.jpg`);
      const boDest =
        kind === "catalog"
          ? join(boOutDir, `${item.sku}.jpg`)
          : join(boOutDir, `${item.sku}t.jpg`);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500) throw new Error("too small");
        await writeFile(webDest, buf);
        await writeFile(boDest, buf);
        if (kind === "catalog") {
          catalogAvailable.push(item.sku);
          catalogOk += 1;
        } else {
          previewAvailable.push(item.sku);
          previewOk += 1;
        }
      } catch {
        if (kind === "catalog") {
          catalogMissing.push({ sku: item.sku, url });
          catalogFail += 1;
        } else {
          previewMissing.push({ sku: item.sku, url });
          previewFail += 1;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        downloadedAt: new Date().toISOString(),
        total: items.length,
        catalog: {
          availableCount: catalogAvailable.length,
          missingCount: catalogMissing.length,
          available: catalogAvailable,
          missing: catalogMissing
        },
        preview: {
          availableCount: previewAvailable.length,
          missingCount: previewMissing.length,
          available: previewAvailable,
          missing: previewMissing
        }
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Каталог {sku}.jpg: OK ${catalogOk}, нет ${catalogFail}`);
  console.log(`Превью {sku}t.jpg: OK ${previewOk}, нет ${previewFail}`);
  console.log(`Подробности: data/baget-assets-manifest.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
