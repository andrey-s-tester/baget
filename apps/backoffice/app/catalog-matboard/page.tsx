"use client";

import { useEffect, useState, useCallback, memo } from "react";
import toast from "react-hot-toast";
import { BoCatalogGridSkeleton } from "../components/BoPageSkeleton";

type MatboardItem = {
  sku: string;
  name: string;
  pricePerM2: number;
  imageUrl: string;
  isActive: boolean;
  stockM2: number;
  minStockM2: number | null;
};

/** Меньше карточек на первый экран — меньше параллельных JPEG (полноразмерные файлы с внешнего сайта). */
const PAGE_SIZE = 24;
const EAGER_IMAGE_COUNT = 12;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CatalogMatboardPage() {
  const [items, setItems] = useState<MatboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchDebounced = useDebounce(search, 400);
  const [editingItem, setEditingItem] = useState<MatboardItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadCatalog = useCallback(() => {
    setError(null);
    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    const params = new URLSearchParams();
    if (searchDebounced.trim()) params.set("q", searchDebounced.trim());
    params.set("limit", "120");
    fetch(`/api/catalog/inventory/matboard?${params}`, { credentials: "include", cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Ошибка ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const arr = (Array.isArray(data) ? data : []) as MatboardItem[];
        setItems(
          arr.map((row) => ({
            ...row,
            stockM2: Number(row.stockM2) || 0,
            minStockM2: row.minStockM2 == null ? null : Number(row.minStockM2)
          }))
        );
        setError(null);
      })
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : "Не удалось загрузить каталог");
      })
      .finally(() => setLoading(false));
  }, [searchDebounced]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, items.length));
  }, [items.length]);

  const handleSaved = useCallback((updated: MatboardItem, originalSku?: string) => {
    setItems((prev) => {
      if (originalSku !== undefined) {
        return prev.map((i) => (i.sku === originalSku ? updated : i));
      }
      return [updated, ...prev];
    });
    setEditingItem(null);
    setShowAddModal(false);
  }, []);

  const deleteItem = useCallback(
    async (sku: string) => {
      if (!confirm(`Удалить паспарту ${sku}?`)) return;
      try {
        const res = await fetch("/api/catalog/matboard", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku })
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
    },
    [loadCatalog]
  );

  return (
    <>
      <div className="bo-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="bo-page-title">Каталог паспарту</h1>
          <p className="bo-page-subtitle">
            Данные с{" "}
            <a href="https://bagetnaya-masterskaya.com/baget_online" target="_blank" rel="noreferrer" className="bo-link">
              bagetnaya-masterskaya.com
            </a>
            . Остатки — м² на складе. Обновить каталог: <code>npm run catalog:pull-matboard</code>
          </p>
        </div>
        <button type="button" className="bo-btn bo-btn-primary" onClick={() => setShowAddModal(true)}>
          Добавить
        </button>
      </div>

      <div className="bo-form-row" style={{ marginBottom: 24 }}>
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
      </div>

      {error && (
        <div className="bo-empty" style={{ color: "#dc2626" }}>
          <strong>{error}</strong>
          <button type="button" className="bo-btn bo-btn-primary" onClick={loadCatalog} style={{ marginTop: 12 }}>
            Повторить
          </button>
        </div>
      )}
      {loading && !error ? (
        <BoCatalogGridSkeleton count={12} />
      ) : !error ? (
        <>
          <div className="bo-grid-cards">
            {visibleItems.map((item, index) => (
              <MatboardCard
                key={item.sku}
                item={item}
                imageLoading={index < EAGER_IMAGE_COUNT ? "eager" : "lazy"}
                onEdit={() => setEditingItem(item)}
                onDelete={() => deleteItem(item.sku)}
              />
            ))}
          </div>
          {editingItem && (
            <EditMatboardModal
              item={editingItem}
              onClose={() => setEditingItem(null)}
              onSaved={handleSaved}
            />
          )}
          {showAddModal && (
            <EditMatboardModal
              item={null}
              isNew
              onClose={() => setShowAddModal(false)}
              onSaved={handleSaved}
            />
          )}
          {hasMore && (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <button type="button" className="bo-btn bo-btn-secondary" onClick={loadMore}>
                Показать ещё {Math.min(PAGE_SIZE, items.length - visibleCount)}
              </button>
            </div>
          )}
        </>
      ) : null}

      {!loading && !error && items.length === 0 && (
        <div className="bo-empty">
          <strong>Ничего не найдено</strong>
          <p style={{ marginTop: 8 }}>Запустите npm run catalog:pull-matboard для загрузки с сайта</p>
        </div>
      )}
    </>
  );
}

function EditMatboardModal({
  item,
  isNew,
  onClose,
  onSaved
}: {
  item: MatboardItem | null;
  isNew?: boolean;
  onClose: () => void;
  onSaved: (updated: MatboardItem, originalSku?: string) => void;
}) {
  const [sku, setSku] = useState(item?.sku ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [pricePerM2, setPricePerM2] = useState(item?.pricePerM2 ?? 5000);
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [stockM2, setStockM2] = useState(item?.stockM2 ?? 0);
  const [minStockM2, setMinStockM2] = useState<number | "">(item?.minStockM2 ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setSku(item.sku);
      setName(item.name);
      setPricePerM2(item.pricePerM2);
      setImageUrl(item.imageUrl);
      setIsActive(item.isActive);
      setStockM2(item.stockM2);
      setMinStockM2(item.minStockM2 ?? "");
    } else if (isNew) {
      setSku("");
      setName("");
      setPricePerM2(5000);
      setImageUrl("");
      setIsActive(true);
      setStockM2(0);
      setMinStockM2("");
    }
  }, [item, isNew]);

  async function handleSave() {
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch("/api/catalog/matboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: sku || undefined,
            name,
            pricePerM2,
            imageUrl: imageUrl || undefined,
            isActive,
            stockM2: 0,
            minStockM2: minStockM2 === "" ? null : Number(minStockM2),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          onSaved({
            sku: data.sku ?? sku,
            name,
            pricePerM2,
            imageUrl,
            isActive,
            stockM2: 0,
            minStockM2: minStockM2 === "" ? null : Number(minStockM2),
          });
          toast.success("Карточка добавлена");
        } else {
          toast.error(data.message || "Ошибка");
        }
      } else {
        const res = await fetch("/api/catalog/matboard", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findBySku: item!.sku,
            sku,
            name,
            pricePerM2,
            imageUrl,
            isActive,
            minStockM2: minStockM2 === "" ? null : Number(minStockM2),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          onSaved(
            {
              sku,
              name,
              pricePerM2,
              imageUrl,
              isActive,
              stockM2,
              minStockM2: minStockM2 === "" ? null : Number(minStockM2),
            },
            item!.sku,
          );
          toast.success("Изменения сохранены");
        } else {
          toast.error(data.message || "Ошибка");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 20px" }}>{isNew ? "Добавить паспарту" : "Редактировать"}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label>
            <span>Артикул</span>
            <input className="bo-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="11092" disabled={!isNew} />
          </label>
          <label>
            <span>Название / цвет</span>
            <input className="bo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Серый" />
          </label>
          <label>
            <span>Цена, руб./м²</span>
            <input type="number" className="bo-input" value={pricePerM2} onChange={(e) => setPricePerM2(Number(e.target.value) || 0)} />
          </label>
          <label>
            <span>URL картинки</span>
            <input className="bo-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>В каталоге</span>
          </label>
          <div>
            <span style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Остаток, м²</span>
            <div
              className="bo-input"
              style={{
                background: "#f1f5f9",
                cursor: "default",
                display: "flex",
                alignItems: "center",
                minHeight: 40,
              }}
            >
              {isNew ? (
                <span style={{ color: "var(--bo-text-muted)", fontSize: 14 }}>0 — приход в «Склад»</span>
              ) : (
                <strong>{stockM2.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}</strong>
              )}
            </div>
          </div>
          <label>
            <span>Порог «мало», м²</span>
            <input
              type="number"
              step="0.0001"
              min={0}
              className="bo-input"
              value={minStockM2}
              onChange={(e) => {
                const v = e.target.value;
                setMinStockM2(v === "" ? "" : Math.max(0, Number(v) || 0));
              }}
              placeholder="пусто — не подсвечивать"
            />
          </label>
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
          <button type="button" className="bo-btn bo-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button type="button" className="bo-btn bo-btn-secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

const MatboardCard = memo(function MatboardCard({
  item,
  imageLoading = "lazy",
  onEdit,
  onDelete
}: {
  item: MatboardItem;
  imageLoading?: "lazy" | "eager";
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="bo-card bo-catalog-card" style={{ position: "relative", paddingTop: 36 }}>
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 1 }}>
        <button type="button" className="bo-btn bo-btn-secondary" onClick={onEdit} style={{ padding: "4px 10px", fontSize: 12 }}>
          Редактировать
        </button>
        <button type="button" className="bo-btn bo-btn-ghost" onClick={onDelete} style={{ padding: "4px 10px", fontSize: 12, color: "#dc2626" }}>
          Удалить
        </button>
      </div>
      <div className="bo-img-row">
        <div className="bo-img-box" style={{ flex: 1 }}>
          {imgErr ? (
            <span style={{ fontSize: 11, color: "var(--bo-text-muted)" }}>Нет фото</span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.imageUrl}
              alt=""
              loading={imageLoading}
              decoding={imageLoading === "eager" ? "sync" : "async"}
              fetchPriority={imageLoading === "eager" ? "high" : "low"}
              referrerPolicy="no-referrer"
              onError={() => setImgErr(true)}
              style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }}
            />
          )}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Арт. {item.sku}</div>
      <div style={{ fontSize: 13, color: "var(--bo-text-muted)" }}>{item.name || "—"}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{item.pricePerM2.toLocaleString("ru-RU")} руб./м²</div>
      <div style={{ fontSize: 12, marginTop: 6, color: "var(--bo-text-muted)" }}>
        Склад:{" "}
        <strong style={{ color: "var(--bo-text)" }}>
          {Number(item.stockM2).toLocaleString("ru-RU", { maximumFractionDigits: 4 })} м²
        </strong>
        {item.minStockM2 != null &&
        item.minStockM2 > 0 &&
        Number(item.stockM2) < item.minStockM2 ? (
          <span style={{ marginLeft: 8, color: "#b45309", fontWeight: 600 }}>мало</span>
        ) : null}
      </div>
      <span
        className="bo-badge"
        style={{
          marginTop: 8,
          display: "inline-block",
          background: item.isActive ? "#dcfce7" : "#f1f5f9",
          color: item.isActive ? "#166534" : "#64748b"
        }}
      >
        {item.isActive ? "В каталоге" : "Скрыт"}
      </span>
    </div>
  );
});
