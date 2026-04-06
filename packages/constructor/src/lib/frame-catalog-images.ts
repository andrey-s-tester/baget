export type FrameImgFields = { sku: string; imageUrl?: string; previewImageUrl?: string };

/** Один URL: сервер в /api/resolved-frame-image сам перебирает варианты (быстрее, чем цепочка img). */
export function getResolvedFrameImageSrc(item: FrameImgFields): string {
  const q = new URLSearchParams();
  q.set("sku", item.sku);
  if (item.imageUrl?.trim()) q.set("p", item.imageUrl.trim());
  if (item.previewImageUrl?.trim()) q.set("s", item.previewImageUrl.trim());
  return `/api/resolved-frame-image?${q.toString()}`;
}

/**
 * URL для **превью рамы на canvas** (repeat по полосе).
 * `strip=1`: сервер сначала берёт узкие текстуры `…t.jpg`, иначе любое разрешённое превью/каталог из БД
 * (SvitArt `thumbnail.php`, optom `small_…`, полный JPEG) — иначе у импортированных артикулов картинка не подставлялась.
 */
export function getFrameTextureResolvedSrc(item: FrameImgFields): string {
  const q = new URLSearchParams();
  q.set("sku", item.sku);
  q.set("strip", "1");
  const prev = item.previewImageUrl?.trim();
  const img = item.imageUrl?.trim();
  if (prev) q.set("s", prev);
  if (img && img !== prev) q.set("p", img);
  return `/api/resolved-frame-image?${q.toString()}`;
}
