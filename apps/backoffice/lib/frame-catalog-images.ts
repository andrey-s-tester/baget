export type FrameImgFields = { sku: string; imageUrl?: string; previewImageUrl?: string };

/** Один URL: сервер в /api/resolved-frame-image сам перебирает варианты (быстрее, чем цепочка img). */
export function getResolvedFrameImageSrc(item: FrameImgFields): string {
  const q = new URLSearchParams();
  q.set("sku", item.sku);
  if (item.imageUrl?.trim()) q.set("p", item.imageUrl.trim());
  if (item.previewImageUrl?.trim()) q.set("s", item.previewImageUrl.trim());
  return `/api/resolved-frame-image?${q.toString()}`;
}
