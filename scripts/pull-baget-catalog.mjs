import { writeFile, mkdir } from "node:fs/promises";

const BASE_URL = "https://bagetnaya-masterskaya.com/base/getcatalog.php";
const TYPES = [
  { remote: "plast", local: "plastic" },
  { remote: "wood", local: "wood" },
  { remote: "alum", local: "aluminum" }
];

function parseIntSafe(value, fallback = 0) {
  const num = Number.parseInt(String(value), 10);
  return Number.isFinite(num) ? num : fallback;
}

function parseCatalog(html, category) {
  const blocks = html.split("<div class='my-2 col-6 col-xl-2");
  const items = [];

  for (const block of blocks) {
    const idMatch = block.match(/z\[0\]=(\d+);/);
    const priceMatch = block.match(/z\[1\]=(\d+);/);
    const widthMatch = block.match(/z\[2\]=(\d+);/);
    const noQuarterMatch = block.match(/z\[22\]=(\d+);/);
    const inStock = block.includes("В наличии");

    if (!idMatch || !priceMatch || !widthMatch) {
      continue;
    }

    const sku = idMatch[1];
    items.push({
      sku,
      name: `Baget ${sku}`,
      category,
      widthMm: parseIntSafe(widthMatch[1]),
      widthWithoutQuarterMm: parseIntSafe(noQuarterMatch?.[1] ?? 0),
      retailPriceMeter: parseIntSafe(priceMatch[1]),
      /** Картинка для каталога (как на сайте) */
      imageUrl: `https://bagetnaya-masterskaya.com/bi/${sku}.jpg`,
      /** Текстура для превью рамы (другой кадр/ракурс, см. {sku}t.jpg на сайте) */
      previewImageUrl: `https://bagetnaya-masterskaya.com/bi/${sku}t.jpg`,
      isActive: inStock
    });
  }

  return items;
}

async function fetchType(remoteType, category) {
  let page = 1;
  const all = [];

  while (page <= 50) {
    const body = new URLSearchParams({
      type: remoteType,
      sorter: "publicvendor-asc",
      page: String(page),
      search: "false",
      query: ""
    });

    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://bagetnaya-masterskaya.com/baget_online"
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${remoteType} page ${page}: ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseCatalog(html, category);
    if (parsed.length === 0) {
      break;
    }

    all.push(...parsed);
    page += 1;
  }

  return all;
}

async function main() {
  const rows = [];
  for (const t of TYPES) {
    const items = await fetchType(t.remote, t.local);
    rows.push(...items);
  }

  const uniqueBySku = new Map(rows.map((item) => [item.sku, item]));
  const result = Array.from(uniqueBySku.values()).sort((a, b) => a.sku.localeCompare(b.sku));

  await mkdir("data", { recursive: true });
  await writeFile("data/baget-catalog.json", JSON.stringify(result, null, 2), "utf8");

  console.log(`Saved ${result.length} baget items to data/baget-catalog.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
