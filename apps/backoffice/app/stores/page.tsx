"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BoTablePageSkeleton } from "../components/BoPageSkeleton";

type Store = {
  id: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
};

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", phone: "" });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/stores", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      setStores(Array.isArray(data) ? data : []);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setForm({ name: "", address: "", phone: "" });
        await load();
        toast.success("Магазин добавлен");
      } else {
        toast.error(data.message || "Ошибка добавления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function handleUpdate(id: string) {
    try {
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editForm }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditingId(null);
        await load();
        toast.success("Изменения сохранены");
      } else {
        toast.error(data.message || "Ошибка сохранения");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function toggleActive(store: Store) {
    try {
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: store.id, isActive: !store.isActive }),
      });
      const data = await res.json();
      if (data.ok) {
        await load();
        toast.success(store.isActive ? "Магазин закрыт" : "Магазин открыт");
      } else {
        toast.error(data.message || "Ошибка");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function deleteStore(id: string) {
    if (!confirm("Удалить магазин?")) return;
    try {
      const res = await fetch("/api/stores", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        await load();
        toast.success("Магазин удалён");
      } else {
        toast.error(data.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  if (loading) return <BoTablePageSkeleton titleWidth={160} />;

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Магазины</h1>
        <p className="bo-page-subtitle">
          Список магазинов. Используется в заказах и при назначении сотрудников.
        </p>
      </div>

      <form onSubmit={handleAdd} className="bo-form-row" style={{ marginBottom: 24 }}>
        <input
          className="bo-input"
          placeholder="Название"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          style={{ minWidth: 180 }}
        />
        <input
          className="bo-input"
          placeholder="Адрес"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          style={{ minWidth: 200 }}
        />
        <input
          className="bo-input"
          placeholder="Телефон"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          style={{ width: 140 }}
        />
        <button type="submit" className="bo-btn bo-btn-primary">
          Добавить магазин
        </button>
      </form>

      <div className="bo-card">
        {stores.length === 0 ? (
          <div className="bo-empty">Нет магазинов. Добавьте первый.</div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Адрес</th>
                <th>Телефон</th>
                <th style={{ width: 100 }}>Статус</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id}>
                  {editingId === s.id ? (
                    <>
                      <td>
                        <input
                          className="bo-input"
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td>
                        <input
                          className="bo-input"
                          value={editForm.address}
                          onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td>
                        <input
                          className="bo-input"
                          value={editForm.phone}
                          onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                          style={{ width: "100%" }}
                        />
                      </td>
                      <td colSpan={2}>
                        <button
                          type="button"
                          className="bo-btn bo-btn-primary"
                          onClick={() => handleUpdate(s.id)}
                        >
                          Сохранить
                        </button>{" "}
                        <button
                          type="button"
                          className="bo-btn bo-btn-secondary"
                          onClick={() => setEditingId(null)}
                        >
                          Отмена
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{s.address || "—"}</td>
                      <td>{s.phone || "—"}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleActive(s)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            fontSize: 12,
                            background: s.isActive ? "#dcfce7" : "#f1f5f9",
                            color: s.isActive ? "#166534" : "#64748b",
                          }}
                        >
                          {s.isActive ? "Активен" : "Закрыт"}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="bo-btn bo-btn-ghost"
                          onClick={() => {
                            setEditingId(s.id);
                            setEditForm({ name: s.name, address: s.address, phone: s.phone });
                          }}
                        >
                          Изменить
                        </button>{" "}
                        <button
                          type="button"
                          className="bo-btn bo-btn-ghost"
                          onClick={() => deleteStore(s.id)}
                          style={{ color: "#dc2626" }}
                        >
                          Удалить
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
