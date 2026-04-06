import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://svitart.net";
const CATEGORY_PATH =
  "/ru/production/category/baget?obj[trees/categories]=/8dea0/81e2e";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YanakCatalogPull/1";
const PLACEHOLDER_RETAIL_PER_METER = 5000;
const DELAY_MS = 450;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function absUrl(rel) {
  const t = rel.trim();
  if (t.startsWith("http")) return t;
  return `${BASE}${t.startsWith("/") ? "" : "/"}${t}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = await res.arrayBuffer();
  return new TextDecoder("windows-1251").decode(buf);
}

/** Серии с лендинга категории: obj[tags/series]=SAxxxx */
function parseSeriesCodes(categoryHtml) {
  const seen = new Set();
  const re = /obj\[tags\/series\]=([A-Za-z0-9]+)/g;
  let m;
  while ((m = re.exec(categoryHtml)) !== null) {
    seen.add(m[1]);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "en"));
}

function seriesViewUrl(series) {
  const params = new URLSearchParams();
  params.set("obj[trees/categories]", "/8dea0/81e2e");
  params.set("obj[tags/series]", series);
  return `${BASE}/ru/production/category/baget/view?${params.toString()}`;
}

/**
 * Карточки в таблице #baget-gallery: миниатюра thumbnail.php + артикул в ссылке.
 */
function parseSeriesPageItems(html, series) {
  const items = [];
  const blocks = html.split('<div class="gal_item">').slice(1);
  for (const block of blocks) {
    const imgM = block.match(
      /<img[^>]+src="(\/thumbnail\.php\?[^"]+)"[^>]*alt="([^"]*)"/i
    );
    const titleM = block.match(
      /<div class="item-block-text1">\s*<a[^>]*>([^<]+)<\/a>/i
    );
    if (!imgM || !titleM) continue;
    const thumbRel = imgM[1].trim();
    const alt = imgM[2].replace(/\s+/g, " ").trim();
    const code = titleM[1].replace(/\s+/g, " ").trim();
    if (!code) continue;
    const fileM = thumbRel.match(/file=([^&]+)/);
    if (!fileM) continue;
    let filePath = decodeURIComponent(fileM[1].replace(/\+/g, " ")).trim();
    if (!filePath.startsWith("/")) filePath = `/${filePath}`;
    const previewImageUrl = absUrl(thumbRel);
    const imageUrl = absUrl(filePath);
    const sku = `SV-${code.replace(/\s/g, "")}`;
    const name = alt || `Пластиковый багет ${series} ${code}`;
    items.push({
      sku,
      name,
      series,
      category: "plastic",
      widthMm: 50,
      widthWithoutQuarterMm: 44,
      retailPriceMeter: PLACEHOLDER_RETAIL_PER_METER,
      imageUrl,
      previewImageUrl,
      isActive: true,
      catalogSource: "svitart_net"
    });
  }
  return items;
}

async function main() {
  const categoryUrl = `${BASE}${CATEGORY_PATH}`;
  console.log("Fetching category…", categoryUrl);
  const catHtml = await fetchHtml(categoryUrl);
  const seriesList = parseSeriesCodes(catHtml);
  console.log(`Found ${seriesList.length} series`);

  const all = [];
  let i = 0;
  for (const series of seriesList) {
    i += 1;
    const url = seriesViewUrl(series);
    try {
      const html = await fetchHtml(url);
      const parsed = parseSeriesPageItems(html, series);
      all.push(...parsed);
      if (i % 20 === 0 || parsed.length === 0) {
        console.log(`  [${i}/${seriesList.length}] ${series}: ${parsed.length} items`);
      }
    } catch (e) {
      console.warn(`  skip ${series}:`, e.message || e);
    }
    await sleep(DELAY_MS);
  }

  const bySku = new Map(all.map((row) => [row.sku, row]));
  const result = [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku, "en"));

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/svitart-baget-catalog.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(
    `Saved ${result.length} items from svitart.net → data/svitart-baget-catalog.json`
  );
  console.log("Артикулы: SV-{код с сайта} (например SV-SA1525-19153). Цена за м — заглушка.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
