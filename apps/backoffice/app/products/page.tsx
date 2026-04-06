"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BoCardPageSkeleton } from "../components/BoPageSkeleton";
import { useBackofficeSession } from "../components/BackofficeSession";

type Product = {
  id: string;
  title: string;
  artist: string;
  sizeLabel: string;
  priceRub: number;
  imageUrl: string;
  description: string | null;
  stockQty: number;
  inStock: boolean;
  isActive: boolean;
};

type ProductForm = {
  title: string;
  artist: string;
  sizeLabel: string;
  priceRub: string;
  stockQty: string;
  imageUrl: string;
  description: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductForm = {
  title: "",
  artist: "",
  sizeLabel: "",
  priceRub: "",
  stockQty: "0",
  imageUrl: "",
  description: "",
  isActive: true
};

export default function ProductsPage() {
  const { permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const canProducts = failOpen ? true : Boolean(permissions?.products);

  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const title = editingId ? "Редактирование товара" : "Новый товар";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/products", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(row: Product) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      artist: row.artist,
      sizeLabel: row.sizeLabel,
      priceRub: String(Number(row.priceRub) || 0),
      stockQty: String(Math.max(0, Math.floor(Number(row.stockQty) || 0))),
      imageUrl: row.imageUrl,
      description: row.description || "",
      isActive: row.isActive
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    const titleTrim = form.title.trim();
    const imageTrim = form.imageUrl.trim();
    if (!titleTrim || !imageTrim) {
      toast.error("Заполните название и URL изображения");
      return;
    }
    setSaving(true);
    const stockQty = Math.max(0, Math.floor(Number(form.stockQty) || 0));
    const payload = {
      ...(editingId ? { id: editingId } : {}),
      title: titleTrim,
      artist: form.artist.trim(),
      sizeLabel: form.sizeLabel.trim(),
      priceRub: Math.max(0, Number(form.priceRub) || 0),
      imageUrl: imageTrim,
      description: form.description.trim() || null,
      stockQty,
      inStock: stockQty > 0,
      isActive: form.isActive
    };
    try {
      const res = await fetch("/api/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data?.ok) {
        toast.error(data?.message || "Не удалось сохранить");
        return;
      }
      toast.success(editingId ? "Товар обновлён" : "Товар добавлен");
      resetForm();
      await load();
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Удалить товар?")) return;
    try {
      const res = await fetch("/api/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!data?.ok) {
        toast.error(data?.message || "Не удалось удалить");
        return;
      }
      toast.success("Товар удалён");
      if (editingId === id) resetForm();
      await load();
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  const sorted = useMemo(() => [...rows], [rows]);

  if (loading) return <BoCardPageSkeleton />;
  if (!canProducts) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Товары» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="bo-card bo-card-body">
        <h1 style={{ margin: 0, fontSize: 24 }}>Товары</h1>
        <p style={{ margin: "8px 0 0", color: "var(--bo-text-muted)" }}>
          Готовые картины для витрины сайта: добавление, редактирование и удаление.
        </p>
      </div>

      <form className="bo-card bo-card-body" onSubmit={saveForm} style={{ display: "grid", gap: 10 }}>
        <strong>{title}</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <input className="bo-input" placeholder="Название" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          <input className="bo-input" placeholder="Автор" value={form.artist} onChange={(e) => setForm((p) => ({ ...p, artist: e.target.value }))} />
          <input className="bo-input" placeholder="Размер (например 40×60 см)" value={form.sizeLabel} onChange={(e) => setForm((p) => ({ ...p, sizeLabel: e.target.value }))} />
          <input className="bo-input" type="number" min={0} placeholder="Цена, руб." value={form.priceRub} onChange={(e) => setForm((p) => ({ ...p, priceRub: e.target.value }))} />
          <input
            className="bo-input"
            type="number"
            min={0}
            placeholder="Количество на складе, шт."
            value={form.stockQty}
            onChange={(e) => setForm((p) => ({ ...p, stockQty: e.target.value }))}
          />
        </div>
        <input className="bo-input" placeholder="URL изображения" value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} />
        <textarea className="bo-input" rows={3} placeholder="Описание" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
            <span>Показывать на витрине</span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="bo-btn bo-btn-primary" type="submit" disabled={saving}>
            {editingId ? "Сохранить изменения" : "Добавить товар"}
          </button>
          {editingId ? (
            <button className="bo-btn bo-btn-secondary" type="button" onClick={resetForm}>
              Отмена
            </button>
          ) : null}
        </div>
      </form>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14
        }}
      >
        {sorted.map((item) => (
          <article key={item.id} className="bo-card bo-card-body" style={{ padding: 12 }}>
            <img
              src={item.imageUrl}
              alt={item.title}
              style={{
                width: "100%",
                aspectRatio: "4 / 3",
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid var(--bo-border)"
              }}
            />
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 16 }}>{item.title}</strong>
              <span style={{ color: "var(--bo-text-muted)", fontSize: 13 }}>{item.artist}</span>
              <span style={{ fontSize: 13 }}>{item.sizeLabel}</span>
              <span style={{ fontWeight: 700 }}>{Number(item.priceRub).toLocaleString("ru-RU")} руб.</span>
              <span style={{ fontSize: 13, color: item.stockQty > 0 ? "#166534" : "#b91c1c" }}>
                На складе: {Math.max(0, Math.floor(Number(item.stockQty) || 0))} шт.
              </span>
              {!item.isActive ? (
                <span style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Скрыт с витрины</span>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" className="bo-btn bo-btn-secondary" onClick={() => startEdit(item)}>
                  Редактировать
                </button>
                <button type="button" className="bo-btn bo-btn-ghost" onClick={() => void removeRow(item.id)}>
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
