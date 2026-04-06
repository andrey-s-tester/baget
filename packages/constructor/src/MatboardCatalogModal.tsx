"use client";

import { memo, useState } from "react";
import { remoteImageViaProxy } from "./lib/image-proxy-url";
import { parseStockM2 } from "./lib/stock";

function toProxySrc(src: string): string {
  return remoteImageViaProxy(src);
}

function MatboardCatalogSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 12
      }}
    >
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 8, padding: 8, background: "#faf8f5" }}>
          <div
            style={{
              height: 90,
              background: "linear-gradient(90deg, #e8e6e3 25%, #f0eeeb 50%, #e8e6e3 75%)",
              backgroundSize: "200% 100%",
              animation: "catalog-skeleton-shimmer 1.2s ease-in-out infinite",
              borderRadius: 4
            }}
          />
          <div style={{ height: 14, background: "#e8e6e3", borderRadius: 4, marginTop: 8, width: "60%" }} />
          <div style={{ height: 10, background: "#e8e6e3", borderRadius: 4, marginTop: 6, width: "80%" }} />
          <div style={{ height: 16, background: "#e8e6e3", borderRadius: 4, marginTop: 8, width: "50%" }} />
        </div>
      ))}
    </div>
  );
}

export type MatboardCatalogItem = {
  sku: string;
  name: string;
  pricePerM2: number;
  imageUrl: string;
  isActive: boolean;
  /** м² на складе (публичный API каталога) */
  stockM2?: number;
  minStockM2?: number | null;
};

type MatboardCatalogModalProps = {
  open: boolean;
  onClose: () => void;
  items: MatboardCatalogItem[];
  loading: boolean;
  error: string;
  selectedSku: string;
  onSelect: (item: MatboardCatalogItem) => void;
};

export function MatboardCatalogModal({
  open,
  onClose,
  items,
  loading,
  error,
  selectedSku,
  onSelect
}: MatboardCatalogModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          maxWidth: 1100,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #eee" }}>
          <strong>Выбор паспарту</strong>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          {loading ? (
            <MatboardCatalogSkeleton />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12
              }}
            >
              {items.map((item) => (
                <MatboardCatalogCard key={item.sku} item={item} selectedSku={selectedSku} onSelect={onSelect} onClose={onClose} />
              ))}
            </div>
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
        padding: 8
      }}
    >
      <div>
        <div style={{ fontSize: 18, lineHeight: 1 }}>🖼️</div>
        <div style={{ marginTop: 4, fontSize: 11 }}>Нет фото</div>
      </div>
    </div>
  );
}

const MatboardCatalogCard = memo(function MatboardCatalogCard({
  item,
  selectedSku,
  onSelect,
  onClose
}: {
  item: MatboardCatalogItem;
  selectedSku: string;
  onSelect: (item: MatboardCatalogItem) => void;
  onClose: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const [sourceIndex, setSourceIndex] = useState(0);
  const candidateSources = [toProxySrc(item.imageUrl), item.imageUrl].filter(Boolean);
  const currentSrc = candidateSources[sourceIndex] ?? "";
  const stock = parseStockM2(item.stockM2);
  const minS = item.minStockM2 != null ? parseStockM2(item.minStockM2) : null;
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
        border: selectedSku === item.sku ? "2px solid #b01f39" : "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 10,
        background: "#fff",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1
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
            color: inStock ? "#166534" : "#92400e"
          }}
        >
          {inStock ? "В наличии" : "Под заказ"}
        </span>
      </div>
      <div style={{ height: 90, background: "#f8fafc", borderRadius: 4, overflow: "hidden", display: "grid", placeItems: "center" }}>
        {!imgOk ? (
          <MissingImagePlaceholder />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSrc}
              alt=""
              width={120}
              height={90}
              style={{ width: "100%", height: 90, objectFit: "contain" }}
              loading="lazy"
              decoding="async"
              onError={() => {
                const nextIndex = sourceIndex + 1;
                if (nextIndex < candidateSources.length) setSourceIndex(nextIndex);
                else setImgOk(false);
              }}
            />
          </>
        )}
      </div>
      <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600 }}>Арт. {item.sku}</div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{item.name || "—"}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
        {item.pricePerM2.toLocaleString("ru-RU")} руб./м²
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: "#64748b" }}>
        Склад:{" "}
        <strong style={{ color: "#0f172a" }}>
          {stock.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} м²
        </strong>
        {low ? (
          <span style={{ marginLeft: 6, color: "#b45309", fontWeight: 600 }}>мало (порог {minS} м²)</span>
        ) : null}
      </div>
    </button>
  );
});
