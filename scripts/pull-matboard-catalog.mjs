import { writeFile, mkdir } from "node:fs/promises";

const BASE_URL = "https://bagetnaya-masterskaya.com/base/getcatalog.php";
const BASE_IMG = "https://bagetnaya-masterskaya.com";

function parseIntSafe(value, fallback = 0) {
  const num = Number.parseInt(String(value), 10);
  return Number.isFinite(num) ? num : fallback;
}

function parseMatboardCatalog(html) {
  const blocks = html.split("<div class='my-2 col-6 col-xl-2");
  const items = [];

  for (const block of blocks.slice(1)) {
    const z3Match = block.match(/z\[3\]=(\d+)/);
    const z4Match = block.match(/z\[4\]=(\d+)/);
    const colorMatch = block.match(/Цвет:\s*([^<\n]+)/);
    const imgMatch = block.match(/src="\s*([^"]+)"/);
    const inStock = block.includes("nal1");

    if (!z3Match || !z4Match) continue;

    const sku = z3Match[1];
    const price = parseIntSafe(z4Match[1]);
    const color = colorMatch ? colorMatch[1].trim() : `Паспарту ${sku}`;
    let imageUrl = `${BASE_IMG}/pi/${sku}.jpg`;
    if (imgMatch) {
      const path = imgMatch[1].replace(/\s/g, "");
      if (path) imageUrl = path.startsWith("http") ? path : `${BASE_IMG}${path}`;
    }

    items.push({
      sku,
      name: color,
      pricePerM2: price,
      imageUrl,
      isActive: inStock
    });
  }

  return items;
}

async function fetchMatboard() {
  let page = 1;
  const all = [];

  while (page <= 50) {
    const body = new URLSearchParams({
      type: "pasp",
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
      throw new Error(`Failed to fetch pasp page ${page}: ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseMatboardCatalog(html);
    if (parsed.length === 0) break;

    all.push(...parsed);
    page += 1;
  }

  return all;
}

async function main() {
  const items = await fetchMatboard();
  const uniqueBySku = new Map(items.map((item) => [item.sku, item]));
  const result = Array.from(uniqueBySku.values()).sort((a, b) => a.sku.localeCompare(b.sku));

  await mkdir("data", { recursive: true });
  await writeFile("data/matboard-catalog.json", JSON.stringify(result, null, 2), "utf8");

  console.log(`Saved ${result.length} matboard items to data/matboard-catalog.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
