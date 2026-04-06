"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";

type FrameCategory = "plastic" | "wood" | "aluminum";

type Props = {
  kind: "frame" | "matboard";
  initialSku: string;
  onClose: () => void;
  /** Возвращает финальный SKU (может отличаться при коллизии на сервере) */
  onCreated: (sku: string) => void;
};

const CATEGORIES: { value: FrameCategory; label: string }[] = [
  { value: "plastic", label: "Пластик" },
  { value: "wood", label: "Дерево" },
  { value: "aluminum", label: "Алюминий" },
];

export function CreateCatalogFromWarehouseModal({ kind, initialSku, onClose, onCreated }: Props) {
  const [sku, setSku] = useState(initialSku.trim());
  const [name, setName] = useState(kind === "frame" ? "Новый багет" : "");
  const [category, setCategory] = useState<FrameCategory>("plastic");
  const [widthMm, setWidthMm] = useState(50);
  const [retailPriceMeter, setRetailPriceMeter] = useState(5000);
  const [pricePerM2, setPricePerM2] = useState(5000);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSku(initialSku.trim());
  }, [initialSku]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = sku.trim();
    if (!s) {
      toast.error("Укажите артикул");
      return;
    }
    setSaving(true);
    try {
      if (kind === "frame") {
        const res = await fetch("/api/catalog/frames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: s,
            name: name.trim() || "Новый багет",
            category,
            widthMm: Math.max(1, widthMm),
            widthWithoutQuarterMm: Math.max(0, widthMm - 6),
            retailPriceMeter: Math.max(0, retailPriceMeter),
            isActive: true,
            stockMeters: 0,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; sku?: string; message?: string };
        if (!res.ok || !data.ok) throw new Error(data.message || `Ошибка ${res.status}`);
        toast.success("Карточка багета создана");
        onCreated(data.sku ?? s);
        onClose();
      } else {
        const res = await fetch("/api/catalog/matboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: s,
            name: name.trim() || s,
            pricePerM2: Math.max(0, Math.round(pricePerM2)),
            isActive: true,
            stockM2: 0,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; sku?: string; message?: string };
        if (!res.ok || !data.ok) throw new Error(data.message || `Ошибка ${res.status}`);
        toast.success("Карточка паспарту создана");
        onCreated(data.sku ?? s);
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bo-modal-overlay" onClick={onClose}>
      <div className="bo-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="bo-modal-header">
          <h2 className="bo-modal-title">
            {kind === "frame" ? "Новый багет" : "Добавить паспарту"}
          </h2>
          <button type="button" className="bo-modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <div className="bo-modal-body">
            <p style={{ fontSize: 13, color: "var(--bo-text-muted)", marginTop: 0 }}>
              Позиции ещё нет в каталоге. Заполните поля — остаток по-прежнему начнётся с нуля; количество
              добавит проведение поступления.
            </p>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span className="bo-form-field__label">Артикул</span>
              <input className="bo-input" style={{ width: "100%" }} value={sku} onChange={(e) => setSku(e.target.value)} required />
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span className="bo-form-field__label">Название</span>
              <input
                className="bo-input"
                style={{ width: "100%" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={kind === "frame"}
                placeholder={kind === "matboard" ? "Необязательно — если пусто, будет как артикул" : undefined}
              />
            </label>
            {kind === "frame" ? (
              <>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span className="bo-form-field__label">Категория</span>
                  <select
                    className="bo-select"
                    style={{ width: "100%" }}
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FrameCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span className="bo-form-field__label">Ширина, мм</span>
                  <input
                    type="number"
                    className="bo-input"
                    style={{ width: "100%" }}
                    min={1}
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value) || 50)}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span className="bo-form-field__label">Цена за м, ₽</span>
                  <input
                    type="number"
                    className="bo-input"
                    style={{ width: "100%" }}
                    min={0}
                    value={retailPriceMeter}
                    onChange={(e) => setRetailPriceMeter(Number(e.target.value) || 0)}
                  />
                </label>
              </>
            ) : (
              <label style={{ display: "block", marginBottom: 12 }}>
                <span className="bo-form-field__label">Цена, ₽/м²</span>
                <input
                  type="number"
                  className="bo-input"
                  style={{ width: "100%" }}
                  min={0}
                  value={pricePerM2}
                  onChange={(e) => setPricePerM2(Number(e.target.value) || 0)}
                />
              </label>
            )}
          </div>
          <div className="bo-modal-footer">
            <button type="button" className="bo-btn bo-btn-secondary" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button type="submit" className="bo-btn bo-btn-primary" disabled={saving}>
              {saving ? "Создание…" : "Создать в каталоге"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
