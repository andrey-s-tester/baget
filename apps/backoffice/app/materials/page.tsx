"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BoCardPageSkeleton } from "../components/BoPageSkeleton";

type GlassItem = { id: string; name: string; pricePerM2: number; stockM2: number; excludeFromStock?: boolean };
type BackingItem = {
  id: string;
  name: string;
  pricePerM2: number | null;
  note: string;
  stockM2: number;
  excludeFromStock?: boolean;
};
type PriceUnit = "piece" | "linear_meter";

type AccessoryItem = {
  id: string;
  name: string;
  price: number;
  stockQty: number;
  priceUnit?: PriceUnit;
  excludeFromStock?: boolean;
};
type MaterialsData = {
  glass: GlassItem[];
  backing: BackingItem[];
  hangers: AccessoryItem[];
  subframes: AccessoryItem[];
  assemblyProducts: AccessoryItem[];
  standLegs: AccessoryItem[];
  finishings: AccessoryItem[];
};

type AccessoryApiType = "hanger" | "subframe" | "assembly_product" | "stand_leg" | "finishing";

const ACCESSORY_LIST_KEY: Record<AccessoryApiType, keyof MaterialsData> = {
  hanger: "hangers",
  subframe: "subframes",
  assembly_product: "assemblyProducts",
  stand_leg: "standLegs",
  finishing: "finishings"
};

function normPriceUnit(u: unknown): PriceUnit {
  return u === "linear_meter" ? "linear_meter" : "piece";
}

function defaultUnitForNew(type: AccessoryApiType): PriceUnit {
  return type === "subframe" || type === "finishing" ? "linear_meter" : "piece";
}

function unitStockLabel(u: PriceUnit) {
  return u === "linear_meter" ? "п.м." : "шт";
}

function stockDisplay(exclude: boolean | undefined, qty: number, unit: string) {
  if (exclude) {
    return <span style={{ color: "var(--bo-text-muted)" }} title="Не учитывается на складе">—</span>;
  }
  return (
    <>
      {qty.toLocaleString("ru-RU")} {unit}
    </>
  );
}

export default function MaterialsPage() {
  const [data, setData] = useState<MaterialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editGlass, setEditGlass] = useState<GlassItem | null>(null);
  const [editBacking, setEditBacking] = useState<BackingItem | null>(null);
  const [newGlass, setNewGlass] = useState(false);
  const [newBacking, setNewBacking] = useState(false);
  const [newHanger, setNewHanger] = useState(false);
  const [editHanger, setEditHanger] = useState<AccessoryItem | null>(null);
  const [editOrderExtra, setEditOrderExtra] = useState<{ type: Exclude<AccessoryApiType, "hanger">; item: AccessoryItem } | null>(null);
  const [newOrderExtra, setNewOrderExtra] = useState<Exclude<AccessoryApiType, "hanger"> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/materials", { credentials: "include", cache: "no-store" });
      const d = (await res.json()) as Record<string, unknown>;
      delete d.fitTypes;
      delete d.hangerTypes;
      const mapGlass = (arr: unknown) =>
        Array.isArray(arr)
          ? (arr as Record<string, unknown>[]).map((x) => ({
              id: String(x.id ?? ""),
              name: String(x.name ?? ""),
              pricePerM2: Number(x.pricePerM2 ?? 0),
              stockM2: Number(x.stockM2 ?? 0),
              excludeFromStock: x.excludeFromStock === true
            }))
          : [];
      const mapBacking = (arr: unknown) =>
        Array.isArray(arr)
          ? (arr as Record<string, unknown>[]).map((x) => ({
              id: String(x.id ?? ""),
              name: String(x.name ?? ""),
              pricePerM2: x.pricePerM2 != null && x.pricePerM2 !== "" ? Number(x.pricePerM2) : null,
              note: String(x.note ?? ""),
              stockM2: Number(x.stockM2 ?? 0),
              excludeFromStock: x.excludeFromStock === true
            }))
          : [];
      const mapAcc = (arr: unknown) =>
        Array.isArray(arr)
          ? (arr as Record<string, unknown>[]).map((x) => ({
              id: String(x.id ?? ""),
              name: String(x.name ?? ""),
              price: Number(x.price ?? 0),
              stockQty: Number(x.stockQty ?? 0),
              priceUnit: normPriceUnit(x.priceUnit),
              excludeFromStock: x.excludeFromStock === true
            }))
          : [];
      const base = d as unknown as MaterialsData;
      setData({
        ...base,
        glass: mapGlass(d.glass),
        backing: mapBacking(d.backing),
        hangers: mapAcc(d.hangers ?? base.hangers),
        subframes: mapAcc(d.subframes),
        assemblyProducts: mapAcc(d.assemblyProducts),
        standLegs: mapAcc(d.standLegs),
        finishings: mapAcc(d.finishings)
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveGlass(item: GlassItem, isNew: boolean) {
    try {
      if (isNew) {
        const res = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "glass", item }),
        });
        const out = await res.json();
        if (out.ok) {
          await load();
          setNewGlass(false);
          toast.success("Материал добавлен");
        } else {
          toast.error(out.message || "Ошибка");
        }
      } else {
        const updated = data!.glass.map((g) => (g.id === item.id ? item : g));
        const res = await fetch("/api/materials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ glass: updated }),
        });
        const out = await res.json();
        if (out.ok) {
          setData(out.data);
          setEditGlass(null);
          toast.success("Изменения сохранены");
        } else {
          toast.error(out.message || "Ошибка");
        }
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function deleteGlass(id: string) {
    if (!confirm("Удалить материал?")) return;
    try {
      const res = await fetch("/api/materials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "glass", id }),
      });
      const out = await res.json();
      if (out.ok) {
        await load();
        toast.success("Материал удалён");
      } else {
        toast.error(out.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function saveBacking(item: BackingItem, isNew: boolean) {
    try {
      if (isNew) {
        const res = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "backing", item }),
        });
        const out = await res.json();
        if (out.ok) {
          await load();
          setNewBacking(false);
        }
      } else {
        const updated = data!.backing.map((b) => (b.id === item.id ? item : b));
        const res = await fetch("/api/materials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backing: updated }),
        });
        const out = await res.json();
        if (out.ok) {
          setData(out.data);
          setEditBacking(null);
          toast.success("Изменения сохранены");
        } else {
          toast.error(out.message || "Ошибка");
        }
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function deleteBacking(id: string) {
    if (!confirm("Удалить материал?")) return;
    try {
      const res = await fetch("/api/materials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "backing", id }),
      });
      const out = await res.json();
      if (out.ok) {
        await load();
        toast.success("Материал удалён");
      } else {
        toast.error(out.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function saveAccessory(type: AccessoryApiType, item: AccessoryItem, isNew: boolean) {
    try {
      if (isNew) {
        const res = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            item: {
              id: item.id,
              name: item.name,
              pricePerM2: item.price,
              priceUnit: item.priceUnit ?? defaultUnitForNew(type),
              excludeFromStock: item.excludeFromStock === true
            }
          })
        });
        const out = await res.json();
        if (out.ok) {
          await load();
          if (type === "hanger") setNewHanger(false);
          else setNewOrderExtra(null);
          toast.success("Материал добавлен");
        }
      } else {
        const key = ACCESSORY_LIST_KEY[type];
        const list = (data![key] as AccessoryItem[]).map((x) => (x.id === item.id ? item : x));
        const payload: Record<string, AccessoryItem[]> = { [key]: list };
        const res = await fetch("/api/materials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const out = await res.json();
        if (out.ok) {
          setData(out.data);
          if (type === "hanger") setEditHanger(null);
          else setEditOrderExtra(null);
          toast.success("Изменения сохранены");
        }
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function deleteAccessory(type: AccessoryApiType, id: string) {
    if (!confirm("Удалить материал?")) return;
    try {
      const res = await fetch("/api/materials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id })
      });
      const out = await res.json();
      if (out.ok) {
        await load();
        toast.success("Материал удалён");
      } else {
        toast.error(out.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  if (loading || !data) return <BoCardPageSkeleton />;

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Материалы</h1>
        <p className="bo-page-subtitle">
          Справочник цен на материалы для расчёта стоимости рамы.{" "}
          <Link href="/pricing" className="bo-link">
            Цены и правила расчёта
          </Link>
        </p>
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--bo-text-muted)", maxWidth: 720 }}>
          «Не учитывать на складе»: остаток в таблице не показывается, при создании заказа списание и проверка наличия для этой
          позиции не выполняются.
        </p>
      </div>

      <p style={{ marginBottom: 24, color: "var(--bo-text-muted)" }}>
        Паспарту вынесены в отдельный каталог —{" "}
        <Link href="/catalog-matboard" className="bo-link">
          Каталог паспарту
        </Link>
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Стекло</h2>
        <div className="bo-card">
          <table className="bo-table">
            <thead>
              <tr>
                <th>Название</th>
                <th style={{ textAlign: "right" }}>Цена, руб./м²</th>
                <th style={{ textAlign: "right" }}>Остаток, м²</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.glass.map((g) =>
                editGlass?.id === g.id ? (
                  <tr key={g.id}>
                    <td>
                      <input
                        className="bo-input"
                        value={editGlass.name}
                        onChange={(e) => setEditGlass((p) => p ? { ...p, name: e.target.value } : null)}
                        style={{ width: "100%" }}
                      />
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 8,
                          fontSize: 13,
                          color: "var(--bo-text-muted)",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editGlass.excludeFromStock === true}
                          onChange={(e) =>
                            setEditGlass((p) => (p ? { ...p, excludeFromStock: e.target.checked } : null))
                          }
                        />
                        Не учитывать на складе
                      </label>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="bo-input"
                        value={editGlass.pricePerM2}
                        onChange={(e) =>
                          setEditGlass((p) => (p ? { ...p, pricePerM2: Number(e.target.value) || 0 } : null))
                        }
                        style={{ width: 100, textAlign: "right" }}
                      />
                    </td>
                    <td style={{ textAlign: "right", color: "var(--bo-text-muted)" }}>
                      {editGlass.excludeFromStock
                        ? "—"
                        : (editGlass.stockM2 ?? 0).toLocaleString("ru-RU")}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bo-btn bo-btn-primary"
                        onClick={() => saveGlass(editGlass, false)}
                      >
                        Сохранить
                      </button>{" "}
                      <button type="button" className="bo-btn bo-btn-secondary" onClick={() => setEditGlass(null)}>
                        Отмена
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={g.id}>
                    <td>
                      {g.name}
                      {g.excludeFromStock ? (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "var(--bo-text-muted)" }}>
                          (без учёта склада)
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>{g.pricePerM2.toLocaleString("ru-RU")}</td>
                    <td style={{ textAlign: "right" }}>
                      {stockDisplay(g.excludeFromStock, g.stockM2 ?? 0, "м²")}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bo-btn bo-btn-ghost"
                        onClick={() => setEditGlass({ ...g })}
                      >
                        Редактировать
                      </button>{" "}
                      <button
                        type="button"
                        className="bo-btn bo-btn-ghost"
                        onClick={() => deleteGlass(g.id)}
                        style={{ color: "#dc2626" }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                )
              )}
              {newGlass && (
                <tr>
                  <td>
                    <input
                      className="bo-input"
                      placeholder="Название"
                      id="new-glass-name"
                      style={{ width: "100%" }}
                    />
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 8,
                        fontSize: 13,
                        color: "var(--bo-text-muted)",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <input type="checkbox" id="new-glass-exclude" />
                      Не учитывать на складе
                    </label>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="bo-input"
                      placeholder="0"
                      id="new-glass-price"
                      style={{ width: 100, textAlign: "right" }}
                    />
                  </td>
                  <td />
                  <td>
                    <button
                      type="button"
                      className="bo-btn bo-btn-primary"
                      onClick={() => {
                        const name = (document.getElementById("new-glass-name") as HTMLInputElement)?.value?.trim();
                        const price = Number((document.getElementById("new-glass-price") as HTMLInputElement)?.value) || 0;
                        const excludeFromStock =
                          (document.getElementById("new-glass-exclude") as HTMLInputElement)?.checked === true;
                        if (name)
                          saveGlass(
                            {
                              id: `glass-${Date.now()}`,
                              name,
                              pricePerM2: price,
                              stockM2: 0,
                              excludeFromStock
                            },
                            true
                          );
                      }}
                    >
                      Добавить
                    </button>{" "}
                    <button type="button" className="bo-btn bo-btn-secondary" onClick={() => setNewGlass(false)}>
                      Отмена
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--bo-border)" }}>
            <button
              type="button"
              className="bo-btn bo-btn-secondary"
              onClick={() => setNewGlass(true)}
              disabled={newGlass}
            >
              Добавить стекло
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Задник</h2>
        <div className="bo-card">
          <table className="bo-table">
            <thead>
              <tr>
                <th>Название</th>
                <th style={{ textAlign: "right" }}>Цена</th>
                <th style={{ textAlign: "right" }}>Остаток, м²</th>
                <th>Примечание</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.backing.map((b) =>
                editBacking?.id === b.id ? (
                  <tr key={b.id}>
                    <td>
                      <input
                        className="bo-input"
                        value={editBacking.name}
                        onChange={(e) => setEditBacking((p) => (p ? { ...p, name: e.target.value } : null))}
                        style={{ width: "100%" }}
                      />
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 8,
                          fontSize: 13,
                          color: "var(--bo-text-muted)",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editBacking.excludeFromStock === true}
                          onChange={(e) =>
                            setEditBacking((p) => (p ? { ...p, excludeFromStock: e.target.checked } : null))
                          }
                        />
                        Не учитывать на складе
                      </label>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="bo-input"
                        value={editBacking.pricePerM2 ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditBacking((p) =>
                            p ? { ...p, pricePerM2: v === "" ? null : Number(v) || 0 } : null
                          );
                        }}
                        placeholder="—"
                        style={{ width: 100, textAlign: "right" }}
                      />
                    </td>
                    <td style={{ textAlign: "right", color: "var(--bo-text-muted)" }}>
                      {editBacking.excludeFromStock
                        ? "—"
                        : (editBacking.stockM2 ?? 0).toLocaleString("ru-RU")}
                    </td>
                    <td>
                      <input
                        className="bo-input"
                        value={editBacking.note}
                        onChange={(e) => setEditBacking((p) => (p ? { ...p, note: e.target.value } : null))}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bo-btn bo-btn-primary"
                        onClick={() => saveBacking(editBacking, false)}
                      >
                        Сохранить
                      </button>{" "}
                      <button type="button" className="bo-btn bo-btn-secondary" onClick={() => setEditBacking(null)}>
                        Отмена
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id}>
                    <td>
                      {b.name}
                      {b.excludeFromStock ? (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "var(--bo-text-muted)" }}>
                          (без учёта склада)
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {b.pricePerM2 != null ? `${b.pricePerM2.toLocaleString("ru-RU")} руб./м²` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {stockDisplay(b.excludeFromStock, b.stockM2 ?? 0, "м²")}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--bo-text-muted)" }}>{b.note}</td>
                    <td>
                      <button
                        type="button"
                        className="bo-btn bo-btn-ghost"
                        onClick={() => setEditBacking({ ...b })}
                      >
                        Редактировать
                      </button>{" "}
                      <button
                        type="button"
                        className="bo-btn bo-btn-ghost"
                        onClick={() => deleteBacking(b.id)}
                        style={{ color: "#dc2626" }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                )
              )}
              {newBacking && (
                <tr>
                  <td>
                    <input
                      className="bo-input"
                      placeholder="Название"
                      id="new-backing-name"
                      style={{ width: "100%" }}
                    />
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 8,
                        fontSize: 13,
                        color: "var(--bo-text-muted)",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <input type="checkbox" id="new-backing-exclude" />
                      Не учитывать на складе
                    </label>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="bo-input"
                      placeholder="—"
                      id="new-backing-price"
                      style={{ width: 100, textAlign: "right" }}
                    />
                  </td>
                  <td />
                  <td>
                    <input
                      className="bo-input"
                      placeholder="Примечание"
                      id="new-backing-note"
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bo-btn bo-btn-primary"
                      onClick={() => {
                        const name = (document.getElementById("new-backing-name") as HTMLInputElement)?.value?.trim();
                        const priceEl = document.getElementById("new-backing-price") as HTMLInputElement;
                        const price = priceEl?.value ? Number(priceEl.value) : null;
                        const note = (document.getElementById("new-backing-note") as HTMLInputElement)?.value ?? "";
                        const excludeFromStock =
                          (document.getElementById("new-backing-exclude") as HTMLInputElement)?.checked === true;
                        if (name)
                          saveBacking(
                            {
                              id: `backing-${Date.now()}`,
                              name,
                              pricePerM2: price,
                              note,
                              stockM2: 0,
                              excludeFromStock
                            },
                            true
                          );
                      }}
                    >
                      Добавить
                    </button>{" "}
                    <button type="button" className="bo-btn bo-btn-secondary" onClick={() => setNewBacking(false)}>
                      Отмена
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--bo-border)" }}>
            <button
              type="button"
              className="bo-btn bo-btn-secondary"
              onClick={() => setNewBacking(true)}
              disabled={newBacking}
            >
              Добавить задник
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Фурнитура: подвес</h2>
        <div className="bo-card">
          <table className="bo-table">
            <thead>
              <tr>
                <th>Название</th>
                <th style={{ textAlign: "right" }}>Цена, руб.</th>
                <th style={{ textAlign: "right" }}>Остаток, шт</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.hangers.map((h) =>
                editHanger?.id === h.id ? (
                  <tr key={h.id}>
                    <td>
                      <input
                        className="bo-input"
                        value={editHanger.name}
                        onChange={(e) => setEditHanger((p) => (p ? { ...p, name: e.target.value } : null))}
                        style={{ width: "100%" }}
                      />
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 8,
                          fontSize: 13,
                          color: "var(--bo-text-muted)",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editHanger.excludeFromStock === true}
                          onChange={(e) =>
                            setEditHanger((p) => (p ? { ...p, excludeFromStock: e.target.checked } : null))
                          }
                        />
                        Не учитывать на складе
                      </label>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="bo-input"
                        value={editHanger.price}
                        onChange={(e) =>
                          setEditHanger((p) => (p ? { ...p, price: Number(e.target.value) || 0 } : null))
                        }
                        style={{ width: 100, textAlign: "right" }}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {editHanger.excludeFromStock ? "—" : editHanger.stockQty.toLocaleString("ru-RU")}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bo-btn bo-btn-primary"
                        onClick={() => saveAccessory("hanger", editHanger, false)}
                      >
                        Сохранить
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={h.id}>
                    <td>
                      {h.name}
                      {h.excludeFromStock ? (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "var(--bo-text-muted)" }}>
                          (без учёта склада)
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>{h.price.toLocaleString("ru-RU")}</td>
                    <td style={{ textAlign: "right" }}>
                      {stockDisplay(h.excludeFromStock, h.stockQty, "шт")}
                    </td>
                    <td>
                      <button type="button" className="bo-btn bo-btn-ghost" onClick={() => setEditHanger({ ...h })}>Редактировать</button>{" "}
                      <button type="button" className="bo-btn bo-btn-ghost" onClick={() => deleteAccessory("hanger", h.id)} style={{ color: "#dc2626" }}>Удалить</button>
                    </td>
                  </tr>
                )
              )}
              {newHanger ? (
                <tr>
                  <td>
                    <input className="bo-input" id="new-hanger-name" style={{ width: "100%" }} placeholder="Название" />
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 8,
                        fontSize: 13,
                        color: "var(--bo-text-muted)",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <input type="checkbox" id="new-hanger-exclude" />
                      Не учитывать на складе
                    </label>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="bo-input"
                      id="new-hanger-price"
                      style={{ width: 100, textAlign: "right" }}
                      placeholder="0"
                    />
                  </td>
                  <td />
                  <td>
                    <button
                      type="button"
                      className="bo-btn bo-btn-primary"
                      onClick={() => {
                        const name = (document.getElementById("new-hanger-name") as HTMLInputElement)?.value?.trim();
                        const price =
                          Number((document.getElementById("new-hanger-price") as HTMLInputElement)?.value) || 0;
                        const excludeFromStock =
                          (document.getElementById("new-hanger-exclude") as HTMLInputElement)?.checked === true;
                        if (name)
                          void saveAccessory(
                            "hanger",
                            { id: `hanger-${Date.now()}`, name, price, stockQty: 0, excludeFromStock },
                            true
                          );
                      }}
                    >
                      Добавить
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--bo-border)" }}>
            <button type="button" className="bo-btn bo-btn-secondary" onClick={() => setNewHanger(true)} disabled={newHanger}>Добавить подвес</button>
          </div>
        </div>
      </section>

      {(
        [
          { type: "subframe" as const, title: "Доп. фурнитура: подрамник" },
          { type: "finishing" as const, title: "Изделие" },
          { type: "assembly_product" as const, title: "По оформлению" },
          { type: "stand_leg" as const, title: "Доп. фурнитура: ножка / подставка" }
        ] as const
      ).map(({ type, title }) => {
        const key = ACCESSORY_LIST_KEY[type];
        const items = (data[key] as AccessoryItem[]) ?? [];
        return (
          <section key={type} style={{ marginTop: 28 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>{title}</h2>
            <div className="bo-card">
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th style={{ textAlign: "right" }}>Цена</th>
                    <th>Учёт</th>
                    <th style={{ textAlign: "right" }}>Остаток</th>
                    <th style={{ width: 140 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((h) =>
                    editOrderExtra?.type === type && editOrderExtra.item.id === h.id ? (
                      <tr key={h.id}>
                        <td>
                          <input
                            className="bo-input"
                            value={editOrderExtra.item.name}
                            onChange={(e) =>
                              setEditOrderExtra((p) =>
                                p && p.type === type ? { ...p, item: { ...p.item, name: e.target.value } } : p
                              )
                            }
                            style={{ width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="bo-input"
                            value={editOrderExtra.item.price}
                            onChange={(e) =>
                              setEditOrderExtra((p) =>
                                p && p.type === type
                                  ? { ...p, item: { ...p.item, price: Number(e.target.value) || 0 } }
                                  : p
                              )
                            }
                            style={{ width: 100, textAlign: "right" }}
                          />
                        </td>
                        <td>
                          <select
                            className="bo-select"
                            style={{ minWidth: 120 }}
                            value={editOrderExtra.item.priceUnit ?? "piece"}
                            onChange={(e) =>
                              setEditOrderExtra((p) =>
                                p && p.type === type
                                  ? {
                                      ...p,
                                      item: {
                                        ...p.item,
                                        priceUnit: e.target.value === "linear_meter" ? "linear_meter" : "piece"
                                      }
                                    }
                                  : p
                              )
                            }
                          >
                            <option value="piece">За шт</option>
                            <option value="linear_meter">За п.м.</option>
                          </select>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 8,
                              fontSize: 13,
                              color: "var(--bo-text-muted)",
                              cursor: "pointer",
                              userSelect: "none"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editOrderExtra.item.excludeFromStock === true}
                              onChange={(e) =>
                                setEditOrderExtra((p) =>
                                  p && p.type === type
                                    ? { ...p, item: { ...p.item, excludeFromStock: e.target.checked } }
                                    : p
                                )
                              }
                            />
                            Не учитывать на складе
                          </label>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {editOrderExtra.item.excludeFromStock
                            ? "—"
                            : `${h.stockQty.toLocaleString("ru-RU")} ${unitStockLabel(normPriceUnit(h.priceUnit))}`}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="bo-btn bo-btn-primary"
                            onClick={() => saveAccessory(type, editOrderExtra.item, false)}
                          >
                            Сохранить
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={h.id}>
                        <td>
                          {h.name}
                          {h.excludeFromStock ? (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--bo-text-muted)" }}>
                              (без учёта склада)
                            </span>
                          ) : null}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {h.price.toLocaleString("ru-RU")}
                          {normPriceUnit(h.priceUnit) === "linear_meter" ? " /п.м." : ""}
                        </td>
                        <td>{normPriceUnit(h.priceUnit) === "linear_meter" ? "Погонный метр" : "Штука"}</td>
                        <td style={{ textAlign: "right" }}>
                          {stockDisplay(
                            h.excludeFromStock,
                            h.stockQty,
                            unitStockLabel(normPriceUnit(h.priceUnit))
                          )}
                        </td>
                        <td>
                          <button type="button" className="bo-btn bo-btn-ghost" onClick={() => setEditOrderExtra({ type, item: { ...h, priceUnit: normPriceUnit(h.priceUnit) } })}>
                            Редактировать
                          </button>{" "}
                          <button
                            type="button"
                            className="bo-btn bo-btn-ghost"
                            onClick={() => deleteAccessory(type, h.id)}
                            style={{ color: "#dc2626" }}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                  {newOrderExtra === type ? (
                    <tr>
                      <td>
                        <input className="bo-input" id={`new-extra-${type}-name`} style={{ width: "100%" }} placeholder="Название" />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="bo-input"
                          id={`new-extra-${type}-price`}
                          style={{ width: 100, textAlign: "right" }}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <select className="bo-select" id={`new-extra-${type}-unit`} style={{ minWidth: 120 }} defaultValue={defaultUnitForNew(type)}>
                          <option value="piece">За шт</option>
                          <option value="linear_meter">За п.м.</option>
                        </select>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 8,
                            fontSize: 13,
                            color: "var(--bo-text-muted)",
                            cursor: "pointer",
                            userSelect: "none"
                          }}
                        >
                          <input type="checkbox" id={`new-extra-${type}-exclude`} />
                          Не учитывать на складе
                        </label>
                      </td>
                      <td />
                      <td>
                        <button
                          type="button"
                          className="bo-btn bo-btn-primary"
                          onClick={() => {
                            const nameEl = document.getElementById(`new-extra-${type}-name`) as HTMLInputElement;
                            const priceEl = document.getElementById(`new-extra-${type}-price`) as HTMLInputElement;
                            const unitEl = document.getElementById(`new-extra-${type}-unit`) as HTMLSelectElement;
                            const exEl = document.getElementById(`new-extra-${type}-exclude`) as HTMLInputElement;
                            const name = nameEl?.value?.trim();
                            const price = Number(priceEl?.value) || 0;
                            const priceUnit = unitEl?.value === "linear_meter" ? "linear_meter" : "piece";
                            const excludeFromStock = exEl?.checked === true;
                            if (name)
                              void saveAccessory(
                                type,
                                {
                                  id: `${type}-${Date.now()}`,
                                  name,
                                  price,
                                  stockQty: 0,
                                  priceUnit,
                                  excludeFromStock
                                },
                                true
                              );
                          }}
                        >
                          Добавить
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--bo-border)" }}>
                <button
                  type="button"
                  className="bo-btn bo-btn-secondary"
                  onClick={() => setNewOrderExtra(type)}
                  disabled={newOrderExtra !== null}
                >
                  Добавить позицию
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
