import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://www.baget-optom.com.ua";
const PAGE_URL = `${BASE}/shop/baget-plastikovijj/`;
const PLACEHOLDER_RETAIL_PER_METER = 5000;

/**
 * Парсит витрину пластикового багета (HostCMS):
 * - каталожное фото — полный JPEG из ссылки <a href> (shop_items_catalog_image…)
 * - превью — миниатюра из <img src> (small_shop_items_catalog_image…)
 */
function absUrl(rel) {
  const t = rel.trim();
  return t.startsWith("http") ? t : `${BASE}${t}`;
}

function parseBagetOptomHtml(html) {
  const items = [];
  const blocks = html.split('<div class="item_baget">');
  for (const block of blocks.slice(1)) {
    const h3 = block.match(/<h3[^>]*class="name_baget"[^>]*>([\s\S]*?)<\/h3>/i);
    const seriesRaw = h3 ? h3[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
    const widthMatch = block.match(/Ширина:\s*([\d.,]+)\s*см/i);
    const widthCm = widthMatch ? Number.parseFloat(widthMatch[1].replace(",", ".")) : NaN;
    const widthMm =
      Number.isFinite(widthCm) && widthCm > 0 ? Math.round(widthCm * 10) : 50;

    const liRe = /<li class="item">([\s\S]*?)<\/li>/gi;
    let lm;
    while ((lm = liRe.exec(block)) !== null) {
      const inner = lm[1];
      const p = inner.match(/<p>([^<]+)<\/p>/);
      if (!p) continue;
      const sku = p[1].trim().replace(/\s+/g, "");
      const a = inner.match(/<a[^>]+href="([^"]+\.jpe?g)"/i);
      if (!a) continue;
      const img = inner.match(/<img[^>]+src="([^"]+\.jpe?g)"/i);
      const relFull = a[1].trim();
      const imageUrl = absUrl(relFull);
      let previewImageUrl = img ? absUrl(img[1].trim()) : imageUrl;
      if (!/\/small_shop_items_catalog_image/i.test(previewImageUrl) && /shop_items_catalog_image/i.test(imageUrl)) {
        previewImageUrl = imageUrl.replace(
          /shop_items_catalog_image/gi,
          "small_shop_items_catalog_image"
        );
      }
      const name = seriesRaw ? `${seriesRaw} · ${sku}` : sku;
      items.push({
        sku,
        name,
        series: seriesRaw,
        category: "plastic",
        widthMm,
        widthWithoutQuarterMm: Math.max(0, widthMm - 6),
        retailPriceMeter: PLACEHOLDER_RETAIL_PER_METER,
        imageUrl,
        previewImageUrl,
        isActive: true,
        catalogSource: "baget_optom_ua"
      });
    }
  }
  return items;
}

async function main() {
  const res = await fetch(PAGE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YanakCatalogPull/1",
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${PAGE_URL}`);
  }
  const html = await res.text();
  const parsed = parseBagetOptomHtml(html);
  const bySku = new Map(parsed.map((row) => [row.sku, row]));
  const result = [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku, "uk"));

  await mkdir("data", { recursive: true });
  await writeFile("data/baget-optom-catalog.json", JSON.stringify(result, null, 2), "utf8");
  console.log(`Saved ${result.length} items from baget-optom.com.ua → data/baget-optom-catalog.json`);
  console.log("Каталог: imageUrl (полный), превью: previewImageUrl (small_…).");
  console.log("Цена за м не указана на списке — в JSON стоит заглушка; уточните в админке или перед сидом.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
