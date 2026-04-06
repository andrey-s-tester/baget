"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";

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

const CATEGORY_OPTIONS: { value: FrameCategory; label: string }[] = [
  { value: "wood", label: "Дерево" },
  { value: "plastic", label: "Пластик" },
  { value: "aluminum", label: "Алюминий" },
];

const SOURCE_OPTIONS: { value: FrameCatalogSource; label: string }[] = [
  { value: "bagetnaya_masterskaya", label: "Багетная мастерская" },
  { value: "baget_optom_ua", label: "baget-optom.com.ua" },
  { value: "svitart_net", label: "svitart.net" },
  { value: "manual", label: "Вручную" },
];

function toBackofficeImageSrc(src: string): string {
  if (!src?.trim()) return "";
  if (!src.startsWith("http")) return src;
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

function CatalogImageWithFallback({
  catalogUrl,
  previewUrl,
  toSrc
}: {
  catalogUrl: string;
  previewUrl?: string;
  toSrc: (s: string) => string;
}) {
  const [usePreview, setUsePreview] = useState(false);
  const catalogSrc = catalogUrl?.trim() ? toSrc(catalogUrl.trim()) : "";
  const previewSrc = previewUrl?.trim()
    ? toSrc(previewUrl.trim())
    : catalogUrl?.trim()
      ? toSrc(catalogUrl.trim().replace(/\.jpg$/i, "t.jpg"))
      : "";

  useEffect(() => {
    setUsePreview(false);
  }, [catalogUrl, previewUrl]);

  const src = usePreview && previewSrc ? previewSrc : catalogSrc;

  if (!src) return <span style={{ fontSize: 12, color: "#64748b" }}>Нет фото</span>;

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      style={{ maxWidth: "100%", maxHeight: 68, objectFit: "contain" }}
      onError={() => {
        if (!usePreview && previewSrc) setUsePreview(true);
      }}
    />
  );
}

type Props = {
  item: CatalogItem | null;
  isNew?: boolean;
  onClose: () => void;
  onSaved: (updated: CatalogItem, originalSku?: string) => void;
};

export function EditCatalogModal({ item, isNew, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CatalogItem>({
    sku: "",
    name: "",
    category: "plastic",
    catalogSource: "manual",
    widthMm: 50,
    widthWithoutQuarterMm: 44,
    retailPriceMeter: 5000,
    imageUrl: "",
    previewImageUrl: "",
    isActive: true,
    stockMeters: 0,
    minStockMeters: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCatalog, setUploadingCatalog] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (item) {
      setForm({
        ...item,
        catalogSource: item.catalogSource ?? "bagetnaya_masterskaya",
        previewImageUrl: item.previewImageUrl ?? "",
        stockMeters: item.stockMeters ?? 0,
        minStockMeters: item.minStockMeters ?? null,
      });
    } else if (isNew) {
      setForm({
        sku: `NEW-${Date.now()}`,
        name: "Новый багет",
        category: "plastic",
        catalogSource: "manual",
        widthMm: 50,
        widthWithoutQuarterMm: 44,
        retailPriceMeter: 5000,
        imageUrl: "",
        previewImageUrl: "",
        isActive: true,
        stockMeters: 0,
        minStockMeters: null,
      });
    }
  }, [item, isNew]);

  const uploadImage = async (file: File, kind: "catalog" | "preview") => {
    const sku = form.sku.trim();
    if (!sku) {
      setError("Сначала заполните SKU");
      return;
    }
    setError("");
    if (kind === "catalog") setUploadingCatalog(true);
    else setUploadingPreview(true);
    try {
      const fd = new FormData();
      fd.set("sku", sku);
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/catalog/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; url?: string; message?: string };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.message || `Ошибка ${res.status}`);
      }
      setForm((p) =>
        kind === "catalog" ? { ...p, imageUrl: data.url! } : { ...p, previewImageUrl: data.url! }
      );
      toast.success("Файл загружен");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
    } finally {
      if (kind === "catalog") setUploadingCatalog(false);
      else setUploadingPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (isNew) {
        const res = await fetch("/api/catalog/frames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            catalogSource: form.catalogSource ?? "manual",
            stockMeters: 0,
            minStockMeters: form.minStockMeters,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.message || `Ошибка ${res.status}`);
        }
        if (data.ok) {
          onSaved({ ...form, sku: data.sku ?? form.sku, catalogSource: form.catalogSource ?? "manual" });
          toast.success("Карточка добавлена");
          onClose();
        }
      } else {
        const res = await fetch("/api/catalog/frames", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findBySku: item!.sku,
            ...form,
            catalogSource: form.catalogSource ?? "bagetnaya_masterskaya",
            minStockMeters: form.minStockMeters,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.message || `Ошибка ${res.status}`);
        }
        if (data.ok) {
          onSaved(
            { ...form, previewImageUrl: form.previewImageUrl || undefined, catalogSource: form.catalogSource },
            item!.sku
          );
          toast.success("Изменения сохранены");
          onClose();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSubmitting(false);
    }
  };

  if (!item && !isNew) return null;

  return (
    <div className="bo-modal-overlay" onClick={onClose}>
      <div className="bo-catalog-edit-modal" onClick={(e) => e.stopPropagation()}>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
        >
          <div className="bo-catalog-edit-modal__header">
            <h2 className="bo-modal-title" style={{ margin: 0 }}>
              {isNew ? "Добавить багет" : "Редактировать карточку"}
            </h2>
          </div>

          <div className="bo-catalog-edit-modal__body">
            {error ? (
              <p style={{ margin: "0 0 16px", color: "#dc2626", fontSize: 13 }}>{error}</p>
            ) : null}

            <div className="bo-form-section">
              <p className="bo-form-section__title">Основные данные</p>
              <p className="bo-form-section__hint">
                Поля в двух колонках выровнены по строкам. Цена — за погонный метр.
              </p>
              <div className="bo-form-grid-2">
                <label>
                  <span>Артикул (SKU)</span>
                  <input
                    className="bo-input"
                    value={form.sku}
                    onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                    required
                    disabled={!isNew}
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Название</span>
                  <input
                    className="bo-input"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Категория</span>
                  <select
                    className="bo-select"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as FrameCategory }))}
                  >
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Источник каталога</span>
                  <select
                    className="bo-select"
                    value={form.catalogSource ?? "manual"}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, catalogSource: e.target.value as FrameCatalogSource }))
                    }
                  >
                    {SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Цена за м, ₽</span>
                  <input
                    type="number"
                    className="bo-input"
                    value={form.retailPriceMeter}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, retailPriceMeter: Number(e.target.value) || 0 }))
                    }
                    min={0}
                  />
                </label>
                <label>
                  <span>Ширина, мм</span>
                  <input
                    type="number"
                    className="bo-input"
                    value={form.widthMm}
                    onChange={(e) => setForm((p) => ({ ...p, widthMm: Number(e.target.value) || 0 }))}
                    min={1}
                  />
                </label>
                <label>
                  <span>Ширина без четверти, мм</span>
                  <input
                    type="number"
                    className="bo-input"
                    value={form.widthWithoutQuarterMm}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, widthWithoutQuarterMm: Number(e.target.value) || 0 }))
                    }
                    min={0}
                  />
                </label>
                <div className="bo-catalog-toggle bo-form-grid-2--span2">
                  <input
                    type="checkbox"
                    id="bo-cat-active"
                    checked={form.isActive}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  <label htmlFor="bo-cat-active" className="bo-catalog-toggle__text" style={{ cursor: "pointer" }}>
                    <strong>Показывать в каталоге</strong>
                    <small>Если выключено, карточка скрыта на витрине (бейдж «Скрыт»).</small>
                  </label>
                </div>
              </div>
            </div>

            <div className="bo-form-section">
              <p className="bo-form-section__title">Изображения</p>
              <p className="bo-form-section__hint">
                Слева — фото для карточки, справа — текстура превью. Можно вставить URL или загрузить файл.
              </p>
              <div className="bo-form-grid-2">
                <div className="bo-image-upload-block">
                  <div className="bo-image-upload-block__head">Фото каталога</div>
                  <label>
                    <span className="bo-form-field__label">URL</span>
                    <input
                      className="bo-input"
                      value={form.imageUrl}
                      onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                      placeholder="/baget-assets/1001.jpg"
                    />
                  </label>
                  <label style={{ marginTop: 10, display: "block" }}>
                    <span className="bo-form-field__label">Файл</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="bo-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file, "catalog");
                      }}
                      disabled={uploadingCatalog}
                    />
                  </label>
                  {uploadingCatalog ? (
                    <span style={{ fontSize: 12, color: "#64748b", display: "block", marginTop: 6 }}>
                      Загрузка…
                    </span>
                  ) : null}
                  <div className="bo-image-preview-slot">
                    {form.imageUrl || form.previewImageUrl ? (
                      <CatalogImageWithFallback
                        catalogUrl={form.imageUrl ?? ""}
                        previewUrl={form.previewImageUrl}
                        toSrc={toBackofficeImageSrc}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: "#64748b" }}>Превью</span>
                    )}
                  </div>
                </div>
                <div className="bo-image-upload-block">
                  <div className="bo-image-upload-block__head">Превью (текстура)</div>
                  <label>
                    <span className="bo-form-field__label">URL</span>
                    <input
                      className="bo-input"
                      value={form.previewImageUrl ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, previewImageUrl: e.target.value }))}
                      placeholder="/baget-assets/1001t.jpg"
                    />
                  </label>
                  <label style={{ marginTop: 10, display: "block" }}>
                    <span className="bo-form-field__label">Файл</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="bo-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file, "preview");
                      }}
                      disabled={uploadingPreview}
                    />
                  </label>
                  {uploadingPreview ? (
                    <span style={{ fontSize: 12, color: "#64748b", display: "block", marginTop: 6 }}>
                      Загрузка…
                    </span>
                  ) : null}
                  <div className="bo-image-preview-slot">
                    {form.previewImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={toBackofficeImageSrc(form.previewImageUrl)}
                        alt=""
                        style={{ maxWidth: "100%", maxHeight: 68, objectFit: "contain" }}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: "#64748b" }}>Превью</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bo-form-section">
              <p className="bo-form-section__title">Остаток на складе</p>
              <p className="bo-form-section__hint">
                Остаток вводится только документом поступления в разделе «Склад» — здесь он для справки.
              </p>
              <div className="bo-stock-panel">
                <div className="bo-stock-panel__grid">
                  <div>
                    <span className="bo-form-field__label">Остаток, м</span>
                    <div className="bo-stock-readonly">
                      {isNew ? (
                        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--bo-text-muted)" }}>
                          0 — оформите приход на складе
                        </span>
                      ) : (
                        form.stockMeters.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
                      )}
                    </div>
                  </div>
                  <label>
                    <span>Порог «мало», м (пусто — не подсвечивать)</span>
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      className="bo-input"
                      value={form.minStockMeters ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((p) => ({
                          ...p,
                          minStockMeters: v === "" ? null : Math.max(0, Number(v) || 0),
                        }));
                      }}
                      placeholder="например 5"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="bo-catalog-edit-modal__footer">
            <button type="button" className="bo-btn bo-btn-secondary" onClick={onClose} disabled={submitting}>
              Отмена
            </button>
            <button
              type="submit"
              className="bo-btn bo-btn-primary"
              disabled={submitting || uploadingCatalog || uploadingPreview}
            >
              {submitting ? "Сохранение…" : isNew ? "Добавить" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
