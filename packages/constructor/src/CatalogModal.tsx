"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { getResolvedFrameImageSrc } from "./lib/frame-catalog-images";
import { parseStockMeters } from "./lib/stock";
import type { FrameCatalogItem, FrameCategory } from "./types";

const CATEGORY_LABELS: Record<FrameCategory, string> = {
  plastic: "Пластик",
  wood: "Дерево",
  aluminum: "Алюминий",
};

function CatalogSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            borderRadius: 8,
            padding: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <div
            style={{
              height: 120,
              background: "linear-gradient(90deg, #e8e6e3 25%, #f0eeeb 50%, #e8e6e3 75%)",
              backgroundSize: "200% 100%",
              animation: "catalog-skeleton-shimmer 1.2s ease-in-out infinite",
              borderRadius: 4,
            }}
          />
          <div style={{ height: 14, background: "#e8e6e3", borderRadius: 4, marginTop: 8, width: "60%" }} />
          <div style={{ height: 12, background: "#e8e6e3", borderRadius: 4, marginTop: 6, width: "85%" }} />
          <div style={{ height: 14, background: "#e8e6e3", borderRadius: 4, marginTop: 8, width: "50%" }} />
        </div>
      ))}
    </div>
  );
}

type CatalogModalProps = {
  open: boolean;
  onClose: () => void;
  category: FrameCategory;
  onCategoryChange: (c: FrameCategory) => void;
  items: FrameCatalogItem[];
  allItems?: FrameCatalogItem[];
  loading: boolean;
  error: string;
  selectedSku: string;
  onSelect: (item: FrameCatalogItem) => void;
};

export function CatalogModal({
  open,
  onClose,
  category,
  onCategoryChange,
  items,
  allItems,
  loading,
  error,
  selectedSku,
  onSelect,
}: CatalogModalProps) {
  /** По умолчанию — категория из конструктора (например «Дерево»), не «Все». */
  const [categoryFilter, setCategoryFilter] = useState<"" | FrameCategory>(category);
  const [skuQuery, setSkuQuery] = useState("");
  const [stockSort, setStockSort] = useState<"stock_desc" | "stock_asc" | "sku">("stock_desc");

  useEffect(() => {
    if (!open) return;
    setCategoryFilter(category);
    setSkuQuery("");
    setStockSort("stock_desc");
  }, [open, category]);

  const pool = useMemo(() => {
    if (allItems && allItems.length > 0) return allItems;
    return items;
  }, [allItems, items]);

  const normalizedQuery = skuQuery.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    const sm = (item: FrameCatalogItem) => parseStockMeters(item.stockMeters);
    let list = pool;
    if (normalizedQuery) {
      list = list.filter(
        (item) =>
          item.sku.toLowerCase().includes(normalizedQuery) ||
          item.name.toLowerCase().includes(normalizedQuery)
      );
    } else if (categoryFilter) {
      list = list.filter((i) => i.category === categoryFilter);
    }
    const sorted = [...list];
    if (stockSort === "stock_desc") {
      sorted.sort((a, b) => sm(b) - sm(a) || a.sku.localeCompare(b.sku));
    } else if (stockSort === "stock_asc") {
      sorted.sort((a, b) => sm(a) - sm(b) || a.sku.localeCompare(b.sku));
    } else {
      sorted.sort((a, b) => a.sku.localeCompare(b.sku));
    }
    return sorted;
  }, [pool, categoryFilter, normalizedQuery, stockSort]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-frame-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          maxWidth: 980,
          width: "96vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            flexShrink: 0,
          }}
        >
          <strong id="catalog-frame-title" style={{ fontSize: 16 }}>
            Каталог багета
          </strong>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "#64748b" }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, overflow: "auto", maxHeight: "70vh" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
              alignItems: "flex-end",
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#334155" }}>
              <span>Категория</span>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  const v = e.target.value as "" | FrameCategory;
                  setCategoryFilter(v);
                  if (v) void onCategoryChange(v);
                }}
                style={{
                  minWidth: 140,
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  background: "#fff",
                }}
              >
                <option value="">Все</option>
                {(Object.keys(CATEGORY_LABELS) as FrameCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: "1 1 160px", color: "#334155" }}>
              <span>Сортировка</span>
              <select
                value={stockSort}
                onChange={(e) => setStockSort(e.target.value as "stock_desc" | "stock_asc" | "sku")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  background: "#fff",
                }}
              >
                <option value="stock_desc">Сначала в наличии</option>
                <option value="stock_asc">Сначала под заказ</option>
                <option value="sku">По артикулу</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: "1 1 200px", color: "#334155" }}>
              <span>Поиск</span>
              <input
                type="search"
                value={skuQuery}
                onChange={(e) => setSkuQuery(e.target.value)}
                placeholder="Артикул или название"
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
            </label>
          </div>
          {normalizedQuery ? (
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px", lineHeight: 1.45 }}>
              Поиск по артикулу и названию — по всем категориям; пока введён текст, фильтр «Категория» не применяется.
            </p>
          ) : null}

          {error ? <p style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</p> : null}

          {loading ? (
            <CatalogSkeleton />
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 12,
                }}
              >
                {filteredItems.map((item) => (
                  <CatalogCard
                    key={item.sku}
                    item={item}
                    selectedSku={selectedSku}
                    onSelect={onSelect}
                    onClose={onClose}
                  />
                ))}
              </div>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 14 }}>
                  Ничего не найдено — измените фильтры или поиск
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingImagePlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "#64748b",
        textAlign: "center",
        padding: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 18, lineHeight: 1 }}>🖼️</div>
        <div style={{ marginTop: 4, fontSize: 11 }}>Нет фото</div>
      </div>
    </div>
  );
}

const CatalogCard = memo(function CatalogCard({
  item,
  selectedSku,
  onSelect,
  onClose,
}: {
  item: FrameCatalogItem;
  selectedSku: string;
  onSelect: (item: FrameCatalogItem) => void;
  onClose: () => void;
}) {
  const src = useMemo(
    () =>
      getResolvedFrameImageSrc({
        sku: item.sku,
        imageUrl: item.imageUrl,
        previewImageUrl: item.previewImageUrl,
      }),
    [item.sku, item.imageUrl, item.previewImageUrl]
  );
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
  }, [src]);
  const stock = parseStockMeters(item.stockMeters);
  const minS = item.minStockMeters != null ? parseStockMeters(item.minStockMeters) : null;
  const low = minS != null && minS > 0 && stock < minS;
  const inStock = stock > 0;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(item);
        onClose();
      }}
      style={{
        position: "relative",
        textAlign: "left",
        cursor: "pointer",
        padding: 10,
        borderRadius: 8,
        border: selectedSku === item.sku ? "2px solid #b01f39" : "1px solid #e5e7eb",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1,
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: inStock ? "#dcfce7" : "#fef3c7",
            color: inStock ? "#166534" : "#92400e",
          }}
        >
          {inStock ? "В наличии" : "Под заказ"}
        </span>
      </div>
      <div
        style={{
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {imgBroken ? (
          <MissingImagePlaceholder />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt=""
            style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
          />
        )}
      </div>
      <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13 }}>Арт. {item.sku}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{item.name}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>
        {CATEGORY_LABELS[item.category] ?? item.category}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>
        {item.retailPriceMeter.toLocaleString("ru-RU")} руб./м
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: "#64748b" }}>
        Склад:{" "}
        <strong style={{ color: "#0f172a" }}>
          {stock.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м
        </strong>
        {low ? (
          <span style={{ marginLeft: 6, color: "#b45309", fontWeight: 600 }}>мало (порог {minS} м)</span>
        ) : null}
      </div>
    </button>
  );
});
