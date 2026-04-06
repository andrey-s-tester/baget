"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import toast from "react-hot-toast";
import { getResolvedFrameImageSrc } from "../../lib/frame-catalog-images";
import { BoCatalogGridSkeleton } from "../components/BoPageSkeleton";

const EditCatalogModal = dynamic(
  () => import("./EditCatalogModal").then((m) => ({ default: m.EditCatalogModal })),
  { loading: () => null }
);

type FrameCategory = "plastic" | "wood" | "aluminum";

type FrameCatalogSource = "bagetnaya_masterskaya" | "baget_optom_ua" | "svitart_net" | "manual";

type CatalogItem = {
  sku: string;
  name: string;
  category: FrameCategory;
  catalogSource?: FrameCatalogSource;
  widthMm: number;
  widthWithoutQuarterMm: number;
  retailPriceMeter: number;
  imageUrl: string;
  previewImageUrl?: string;
  isActive: boolean;
  stockMeters: number;
  minStockMeters: number | null;
};

const CATEGORY_LABELS: Record<FrameCategory, string> = {
  wood: "Дерево",
  plastic: "Пластик",
  aluminum: "Алюминий",
};

const SOURCE_LABELS: Record<FrameCatalogSource, string> = {
  bagetnaya_masterskaya: "Багетная мастерская",
  baget_optom_ua: "baget-optom.com.ua",
  svitart_net: "svitart.net",
  manual: "Вручную",
};

type SortMode = "sku" | "stock_desc" | "stock_asc" | "source_sku";

const PAGE_SIZE = 24;
/** Первые карточки без lazy — быстрее LCP; остальное не грузим, пока не у видимой зоны. */
const EAGER_IMAGE_COUNT = 12;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<FrameCategory | "">("");
  const [catalogSource, setCatalogSource] = useState<FrameCatalogSource | "">("");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("sku");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchDebounced = useDebounce(search, 400);

  const loadCatalog = useCallback(() => {
    setError(null);
    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (catalogSource) params.set("catalogSource", catalogSource);
    if (searchDebounced.trim()) params.set("q", searchDebounced.trim());
    if (sortMode === "source_sku") params.set("sort", "source_sku");
    params.set("limit", "2500");
    fetch(`/api/catalog/inventory/frames?${params}`, { credentials: "include", cache: "no-store" })
      .then((r) => {
        if (r.status === 401) {
          toast.error("Сессия недействительна — войдите снова");
          window.location.assign("/login?next=%2Fcatalog");
          throw new Error("401");
        }
        if (!r.ok) throw new Error(`Ошибка ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const arr = (Array.isArray(data) ? data : []) as CatalogItem[];
        setItems(
          arr.map((row) => ({
            ...row,
            catalogSource: (row as CatalogItem).catalogSource ?? "bagetnaya_masterskaya",
            stockMeters: Number(row.stockMeters) || 0,
            minStockMeters: row.minStockMeters == null ? null : Number(row.minStockMeters)
          }))
        );
        setSelectedSkus(new Set());
        setError(null);
      })
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : "Не удалось загрузить каталог");
      })
      .finally(() => setLoading(false));
  }, [category, catalogSource, searchDebounced, sortMode]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const sortedItems = useMemo(() => {
    const arr = [...items];
    if (sortMode === "source_sku") {
      return arr;
    }
    if (sortMode === "stock_desc") {
      arr.sort(
        (a, b) =>
          Number(b.stockMeters) - Number(a.stockMeters) || a.sku.localeCompare(b.sku)
      );
    } else if (sortMode === "stock_asc") {
      arr.sort(
        (a, b) =>
          Number(a.stockMeters) - Number(b.stockMeters) || a.sku.localeCompare(b.sku)
      );
    } else {
      arr.sort((a, b) => a.sku.localeCompare(b.sku));
    }
    return arr;
  }, [items, sortMode]);

  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount]
  );
  const hasMore = visibleCount < sortedItems.length;
  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, sortedItems.length));
  }, [sortedItems.length]);

  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(() => new Set());
  const selectAllVisibleRef = useRef<HTMLInputElement>(null);

  const handleSaved = useCallback((updated: CatalogItem, originalSku?: string) => {
    setItems((prev) => {
      if (originalSku !== undefined) {
        return prev.map((i) => (i.sku === originalSku ? updated : i));
      }
      return [...prev, updated];
    });
    setEditingItem(null);
    setShowAddModal(false);
  }, []);

  const deleteItem = useCallback(async (sku: string) => {
    if (!confirm(`Удалить багет ${sku}?`)) return;
    try {
      const res = await fetch("/api/catalog/frames", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = await res.json();
      if (data.ok) {
        loadCatalog();
        toast.success("Карточка удалена");
      } else {
        toast.error(data.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }, [loadCatalog]);

  const toggleSkuSelected = useCallback((sku: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }, []);

  const visibleSelectedCount = useMemo(
    () => visibleItems.filter((i) => selectedSkus.has(i.sku)).length,
    [visibleItems, selectedSkus]
  );
  const allVisibleSelected =
    visibleItems.length > 0 && visibleSelectedCount === visibleItems.length;

  useEffect(() => {
    const el = selectAllVisibleRef.current;
    if (el) {
      el.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [visibleSelectedCount, allVisibleSelected]);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleItems.forEach((i) => next.delete(i.sku));
      } else {
        visibleItems.forEach((i) => next.add(i.sku));
      }
      return next;
    });
  }, [allVisibleSelected, visibleItems]);

  const clearSelection = useCallback(() => setSelectedSkus(new Set()), []);

  const deleteSelected = useCallback(async () => {
    const skus = [...selectedSkus];
    if (skus.length === 0) return;
    if (!confirm(`Удалить выбранные карточки (${skus.length} шт.)?`)) return;
    try {
      const res = await fetch("/api/catalog/frames", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus }),
      });
      const data = await res.json();
      if (data.ok) {
        const n = typeof data.deleted === "number" ? data.deleted : skus.length;
        loadCatalog();
        toast.success(n === skus.length ? `Удалено: ${n}` : `Удалено: ${n} из ${skus.length}`);
      } else {
        toast.error(data.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }, [selectedSkus, loadCatalog]);

  return (
    <>
      <div className="bo-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="bo-page-title">Каталог багета</h1>
          <p className="bo-page-subtitle">
            Фото: URL в карточке или шаблон Багетной мастерской (<span className="bo-code">{`{sku}.jpg`}</span>).
            Импорт: baget-optom — <span className="bo-code">npm run catalog:pull-optom</span> /{" "}
            <span className="bo-code">npm run catalog:seed-optom</span>; SvitArt —{" "}
            <span className="bo-code">npm run catalog:pull-svitart</span> /{" "}
            <span className="bo-code">npm run catalog:seed-svitart</span>. Источник — фильтр и поле в форме.
          </p>
        </div>
        <button
          type="button"
          className="bo-btn bo-btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          Добавить
        </button>
      </div>

      <div className="bo-form-row" style={{ marginBottom: 24 }}>
        <label>
          <span>Категория</span>
          <select
            className="bo-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as FrameCategory | "")}
            style={{ width: 160 }}
          >
            <option value="">Все</option>
            {(Object.keys(CATEGORY_LABELS) as FrameCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Источник</span>
          <select
            className="bo-select"
            value={catalogSource}
            onChange={(e) => setCatalogSource(e.target.value as FrameCatalogSource | "")}
            style={{ width: 200 }}
          >
            <option value="">Все</option>
            {(Object.keys(SOURCE_LABELS) as FrameCatalogSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          <span>Поиск</span>
          <input
            type="search"
            className="bo-input"
            placeholder="Артикул или название"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
            autoComplete="off"
          />
        </label>
        <label>
          <span>Сортировка</span>
          <select
            className="bo-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={{ width: 240 }}
          >
            <option value="sku">По артикулу</option>
            <option value="source_sku">По источнику, затем артикул</option>
            <option value="stock_desc">Сначала в наличии</option>
            <option value="stock_asc">Сначала под заказ</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="bo-empty" style={{ color: "#dc2626" }}>
          <strong>{error}</strong>
          <button
            type="button"
            className="bo-btn bo-btn-primary"
            onClick={loadCatalog}
            style={{ marginTop: 12 }}
          >
            Повторить
          </button>
        </div>
      )}
      {loading && !error ? (
        <BoCatalogGridSkeleton count={12} />
      ) : !error ? (
        <>
          {sortedItems.length > 0 && (
            <div
              className="bo-form-row"
              style={{
                marginBottom: 16,
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "10px 14px",
                background: "var(--bo-surface-2, #f8fafc)",
                borderRadius: 8,
                border: "1px solid var(--bo-border, #e2e8f0)"
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  userSelect: "none"
                }}
              >
                <input
                  ref={selectAllVisibleRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                />
                <span>Все видимые ({visibleItems.length})</span>
              </label>
              <span style={{ fontSize: 13, color: "var(--bo-text-muted)" }}>
                Выбрано: <strong style={{ color: "var(--bo-text)" }}>{selectedSkus.size}</strong>
              </span>
              <button
                type="button"
                className="bo-btn bo-btn-secondary"
                onClick={clearSelection}
                disabled={selectedSkus.size === 0}
              >
                Снять выбор
              </button>
              <button
                type="button"
                className="bo-btn bo-btn-ghost"
                onClick={deleteSelected}
                disabled={selectedSkus.size === 0}
                style={{ color: "#dc2626", borderColor: "#fecaca" }}
              >
                Удалить выбранные
              </button>
            </div>
          )}
          <div className="bo-grid-cards">
            {visibleItems.map((item, index) => (
              <CatalogCard
                key={item.sku}
                item={item}
                imageLoading={index < EAGER_IMAGE_COUNT ? "eager" : "lazy"}
                selected={selectedSkus.has(item.sku)}
                onToggleSelect={() => toggleSkuSelected(item.sku)}
                onEdit={() => setEditingItem(item)}
                onDelete={() => deleteItem(item.sku)}
              />
            ))}
          </div>
          {editingItem && (
            <EditCatalogModal
              item={editingItem}
              onClose={() => setEditingItem(null)}
              onSaved={handleSaved}
            />
          )}
          {showAddModal && (
            <EditCatalogModal
              item={null}
              isNew
              onClose={() => setShowAddModal(false)}
              onSaved={handleSaved}
            />
          )}
          {hasMore && (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <button
                type="button"
                className="bo-btn bo-btn-secondary"
                onClick={loadMore}
              >
                Показать ещё {Math.min(PAGE_SIZE, sortedItems.length - visibleCount)}
              </button>
            </div>
          )}
        </>
      ) : null}

      {!loading && !error && items.length === 0 && (
        <div className="bo-empty">
          <strong>Ничего не найдено</strong>
          Попробуйте изменить фильтры
        </div>
      )}
    </>
  );
}

const ImageSlot = memo(function ImageSlot({
  item,
  alt,
  label,
  imageLoading = "lazy",
}: {
  item: CatalogItem;
  alt: string;
  label: string;
  imageLoading?: "lazy" | "eager";
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
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <div>
      <div className="bo-img-slot">{label}</div>
      <div className="bo-img-box">
        {broken ? (
          <span style={{ fontSize: 11, color: "var(--bo-text-muted)" }}>Нет фото</span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={alt}
            loading={imageLoading}
            decoding={imageLoading === "eager" ? "sync" : "async"}
            fetchPriority={imageLoading === "eager" ? "high" : "low"}
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        )}
      </div>
    </div>
  );
});

const CatalogCard = memo(function CatalogCard({
  item,
  imageLoading = "lazy",
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  item: CatalogItem;
  imageLoading?: "lazy" | "eager";
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bo-card bo-catalog-card" style={{ position: "relative", paddingTop: 36 }}>
      <label
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontSize: 12,
          color: "var(--bo-text-muted)",
          userSelect: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Выбрать ${item.sku}`}
        />
      </label>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 6,
          zIndex: 1,
        }}
      >
        <button
          type="button"
          className="bo-btn bo-btn-secondary"
          onClick={onEdit}
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          Редактировать
        </button>
        <button
          type="button"
          className="bo-btn bo-btn-ghost"
          onClick={onDelete}
          style={{ padding: "4px 10px", fontSize: 12, color: "#dc2626" }}
        >
          Удалить
        </button>
      </div>
      <div className="bo-img-row">
        <ImageSlot
          item={item}
          alt=""
          label={`Каталог (${item.sku}.jpg)`}
          imageLoading={imageLoading}
        />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Арт. {item.sku}</div>
      <div style={{ fontSize: 13, color: "var(--bo-text-muted)" }}>{item.name}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
        {SOURCE_LABELS[item.catalogSource ?? "bagetnaya_masterskaya"]}
      </div>
      <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>
        {item.widthMm} × {item.widthWithoutQuarterMm} мм
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>
        {item.retailPriceMeter.toLocaleString("ru-RU")} руб./м
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: "var(--bo-text-muted)" }}>
        Склад:{" "}
        <strong style={{ color: "var(--bo-text)" }}>
          {Number(item.stockMeters).toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м
        </strong>
        {item.minStockMeters != null &&
        item.minStockMeters > 0 &&
        Number(item.stockMeters) < item.minStockMeters ? (
          <span style={{ marginLeft: 8, color: "#b45309", fontWeight: 600 }}>мало (порог {item.minStockMeters} м)</span>
        ) : null}
      </div>
      <span
        className={`bo-badge ${item.isActive ? "" : ""}`}
        style={{
          marginTop: 8,
          display: "inline-block",
          background: item.isActive ? "#dcfce7" : "#f1f5f9",
          color: item.isActive ? "#166534" : "#64748b",
        }}
      >
        {item.isActive ? "В каталоге" : "Скрыт"}
      </span>
    </div>
  );
});
