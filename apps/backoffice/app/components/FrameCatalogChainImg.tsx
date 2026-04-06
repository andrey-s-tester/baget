"use client";

import { useMemo } from "react";
import { getResolvedFrameImageSrc, type FrameImgFields } from "../../lib/frame-catalog-images";

export function FrameCatalogChainImg({
  item,
  alt,
  style,
}: {
  item: FrameImgFields;
  alt: string;
  style?: React.CSSProperties;
}) {
  const src = useMemo(() => getResolvedFrameImageSrc(item), [item.sku, item.imageUrl, item.previewImageUrl]);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      style={style}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
