"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useBackofficeSession } from "../components/BackofficeSession";
import { BoWarehouseSkeleton } from "../components/BoPageSkeleton";
import {
  WarehouseSkuPicker,
  type AccessoryGroupInv,
  type AccessoryInvItem,
  type FrameInvItem,
  type MatInvItem
} from "./WarehouseSkuPicker";
import {
  WarehouseShowcasePicker,
  type ShowcaseProductItem
} from "./WarehouseShowcasePicker";

const CreateCatalogFromWarehouseModal = dynamic(
  () => import("./CreateCatalogFromWarehouseModal").then((m) => ({ default: m.CreateCatalogFromWarehouseModal })),
  { loading: () => null }
);

type ReceiptLine = {
  id?: string;
  kind: "frame" | "matboard" | "accessory" | "glass" | "backing" | "showcase";
  sku: string;
  quantity: number;
  accessoryGroup?: AccessoryGroupInv;
  lineNo?: number;
};

type Receipt = {
  id: string;
  docNumber: string;
  status: "draft" | "posted";
  comment: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: ReceiptLine[];
};

const emptyLine = (): ReceiptLine => ({
  kind: "frame",
  sku: "",
  quantity: 0,
});

/** Как в «Материалах»: отдельные виды строк прихода для групп фурнитуры (в API всё равно kind = accessory). */
const ACCESSORY_RECEIPT_OPTIONS: { suffix: AccessoryGroupInv; label: string }[] = [
  { suffix: "hanger", label: "Подвес (шт)" },
  { suffix: "subframe", label: "Подрамник (п.м.)" },
  { suffix: "finishing", label: "Изделие (п.м.)" },
  { suffix: "assembly_product", label: "По оформлению (шт)" },
  { suffix: "stand_leg", label: "Ножка / подставка (шт)" },
  { suffix: "fit_type", label: "Тип прилегания (шт)" },
];

const ACCESSORY_GROUP_LABEL: Record<AccessoryGroupInv, string> = {
  hanger: "Подвес",
  subframe: "Подрамник",
  finishing: "Изделие",
  assembly_product: "По оформлению",
  stand_leg: "Ножка / подставка",
  fit_type: "Тип прилегания",
};

function receiptLineSelectValue(row: ReceiptLine, accCatalog: AccessoryInvItem[]): string {
  if (row.kind === "accessory") {
    let g = row.accessoryGroup;
    if (!g && row.sku) {
      const hit = accCatalog.find((a) => a.code === row.sku);
      if (hit) g = hit.group;
    }
    return `accessory:${g ?? "hanger"}`;
  }
  return row.kind;
}

function resolvedAccessoryGroup(
  row: ReceiptLine,
  accCatalog: AccessoryInvItem[]
): AccessoryGroupInv | undefined {
  if (row.kind !== "accessory") return undefined;
  if (row.accessoryGroup) return row.accessoryGroup;
  if (!row.sku) return undefined;
  return accCatalog.find((a) => a.code === row.sku)?.group;
}

function isAccessoryLinearGroup(g: AccessoryGroupInv | undefined): boolean {
  return g === "subframe" || g === "finishing";
}

type CreateModalState = { kind: "frame" | "matboard"; sku: string; lineIndex: number } | null;

/** Совпадает с верхней границей limit в Nest для inventory-* (багет до 500, остальное до 800). */
const INVENTORY_LIST_LIMIT = 800;
const RECEIPTS_LIST_LIMIT = 80;

export default function WarehousePage() {
  const { permissions } = useBackofficeSession();
  const canShowcaseStock =
    Boolean(permissions?.warehouse) || Boolean(permissions?.products);

  const [list, setList] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [frames, setFrames] = useState<FrameInvItem[]>([]);
  const [matboards, setMatboards] = useState<MatInvItem[]>([]);
  const [glassItems, setGlassItems] = useState<MatInvItem[]>([]);
  const [backingItems, setBackingItems] = useState<MatInvItem[]>([]);
  const [accessories, setAccessories] = useState<AccessoryInvItem[]>([]);
  const [createModal, setCreateModal] = useState<CreateModalState>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const inventoryReadyRef = useRef(false);

  const [showcaseProducts, setShowcaseProducts] = useState<ShowcaseProductItem[]>([]);
  const [showcaseProductsLoading, setShowcaseProductsLoading] = useState(false);

  const loadShowcaseProducts = useCallback(async () => {
    if (!canShowcaseStock) return;
    setShowcaseProductsLoading(true);
    try {
      const res = await fetch("/api/products", { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as unknown;
      const arr = Array.isArray(data) ? data : [];
      const rows: ShowcaseProductItem[] = arr
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => ({
          id: String(x.id ?? ""),
          title: String(x.title ?? "—"),
          artist: String(x.artist ?? ""),
        }))
        .filter((r) => r.id.length > 0);
      setShowcaseProducts(rows);
    } catch {
      setShowcaseProducts([]);
    } finally {
      setShowcaseProductsLoading(false);
    }
  }, [canShowcaseStock]);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const q = `limit=${INVENTORY_LIST_LIMIT}`;
      const [fr, mb, gl, bk, acc] = await Promise.all([
        fetch(`/api/catalog/inventory/frames?${q}`, { cache: "no-store" }),
        fetch(`/api/catalog/inventory/matboard?${q}`, { cache: "no-store" }),
        fetch(`/api/catalog/inventory/glass?${q}`, { cache: "no-store" }),
        fetch(`/api/catalog/inventory/backing?${q}`, { cache: "no-store" }),
        fetch(`/api/catalog/inventory/accessories?${q}`, { cache: "no-store" }),
      ]);
      if (fr.ok) {
        const data = (await fr.json()) as {
          sku: string;
          name: string;
          category: string;
        }[];
        setFrames(
          Array.isArray(data)
            ? data.map((r) => ({ sku: r.sku, name: r.name, category: r.category }))
            : []
        );
      }
      if (mb.ok) {
        const data = (await mb.json()) as { sku: string; name: string }[];
        setMatboards(Array.isArray(data) ? data.map((r) => ({ sku: r.sku, name: r.name })) : []);
      }
      if (gl.ok) {
        const data = (await gl.json()) as { sku: string; name: string }[];
        setGlassItems(Array.isArray(data) ? data.map((r) => ({ sku: r.sku, name: r.name })) : []);
      }
      if (bk.ok) {
        const data = (await bk.json()) as { sku: string; name: string }[];
        setBackingItems(Array.isArray(data) ? data.map((r) => ({ sku: r.sku, name: r.name })) : []);
      }
      if (acc.ok) {
        const data = (await acc.json()) as AccessoryInvItem[];
        setAccessories(
          Array.isArray(data) ? data.filter((a) => (a.group as string) !== "hanger_type") : []
        );
      }
      inventoryReadyRef.current = true;
    } catch {
      toast.error("Не удалось обновить справочник номенклатуры");
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/stock/receipts?limit=${RECEIPTS_LIST_LIMIT}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = (await res.json()) as Receipt[];
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить документы");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /** Справочники для подсказок — только при открытии документа (не при первом заходе на «Склад»). */
  useEffect(() => {
    if (!selected || inventoryReadyRef.current) return;
    void loadInventory();
  }, [selected, loadInventory]);

  useEffect(() => {
    if (!selected || !canShowcaseStock) return;
    void loadShowcaseProducts();
  }, [selected?.id, canShowcaseStock, loadShowcaseProducts]);

  const openReceipt = (r: Receipt) => {
    setSelected(r);
    setComment(r.comment ?? "");
    if (r.lines?.length) {
      setLines(
        r.lines.map((l) => ({
          kind: (l.kind as ReceiptLine["kind"]) || "frame",
          sku: l.sku,
          quantity: l.quantity,
          accessoryGroup: l.accessoryGroup,
        }))
      );
    } else {
      setLines([emptyLine()]);
    }
  };

  /** После загрузки справочника фурнитуры — подставить группу по артикулу (старые документы без accessoryGroup). */
  useEffect(() => {
    if (!selected || accessories.length === 0) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (row.kind !== "accessory" || row.accessoryGroup) return row;
        const hit = accessories.find((a) => a.code === row.sku);
        if (hit) {
          changed = true;
          return { ...row, accessoryGroup: hit.group };
        }
        return row;
      });
      return changed ? next : prev;
    });
  }, [selected?.id, accessories]);

  const newDraft = async () => {
    try {
      const res = await fetch("/api/catalog/stock/receipts", { method: "POST" });
      const data = (await res.json()) as Receipt;
      if (!res.ok) throw new Error((data as { message?: string }).message || `Ошибка ${res.status}`);
      await loadList();
      openReceipt(data);
      toast.success("Черновик создан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const saveDraft = async () => {
    if (!selected || selected.status !== "draft") return;
    const cleanLines = lines
      .map((l) => ({
        kind: l.kind,
        sku: (l.sku ?? "").trim(),
        quantity:
          l.kind === "showcase"
            ? Math.max(1, Math.floor(Number(l.quantity) || 0))
            : Number(l.quantity),
      }))
      .filter((l) => l.sku.length > 0 && Number.isFinite(l.quantity) && l.quantity > 0);
    setSaving(true);
    try {
      const res = await fetch(`/api/catalog/stock/receipts/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() || null, lines: cleanLines }),
      });
      const data = (await res.json()) as Receipt & { message?: string };
      if (!res.ok) throw new Error(data.message || `Ошибка ${res.status}`);
      toast.success("Черновик сохранён");
      await loadList();
      openReceipt(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!selected || selected.status !== "draft") return;
    if (!confirm(`Удалить черновик ${selected.docNumber}?`)) return;
    try {
      const res = await fetch(`/api/catalog/stock/receipts/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message || `Ошибка ${res.status}`);
      }
      toast.success("Удалено");
      setSelected(null);
      setLines([emptyLine()]);
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const postDoc = async () => {
    if (!selected || selected.status !== "draft") return;
    if (!confirm(`Провести документ ${selected.docNumber}? Остатки в каталогах увеличатся.`)) return;
    setSaving(true);
    try {
      const saveRes = await fetch(`/api/catalog/stock/receipts/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: comment.trim() || null,
          lines: lines
            .map((l) => ({
              kind: l.kind,
              sku: (l.sku ?? "").trim(),
              quantity:
                l.kind === "showcase"
                  ? Math.max(1, Math.floor(Number(l.quantity) || 0))
                  : Number(l.quantity),
            }))
            .filter((l) => l.sku.length > 0 && Number.isFinite(l.quantity) && l.quantity > 0),
        }),
      });
      if (!saveRes.ok) {
        const err = (await saveRes.json()) as { message?: string };
        throw new Error(err.message || "Не удалось сохранить перед проведением");
      }
      const res = await fetch(`/api/catalog/stock/receipts/${encodeURIComponent(selected.id)}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message || `Ошибка ${res.status}`);
      toast.success("Документ проведён");
      setSelected(null);
      setLines([emptyLine()]);
      await loadList();
      void loadInventory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка проведения");
    } finally {
      setSaving(false);
    }
  };

  const onCatalogCreated = async (finalSku: string, lineIndex: number) => {
    setLines((p) => p.map((row, i) => (i === lineIndex ? { ...row, sku: finalSku } : row)));
    await loadInventory();
  };

  const showcaseTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of showcaseProducts) m.set(p.id, p.title);
    return m;
  }, [showcaseProducts]);

  function lineKindPostedLabel(row: ReceiptLine) {
    const { kind } = row;
    if (kind === "frame") return "Багет";
    if (kind === "matboard") return "Паспарту";
    if (kind === "glass") return "Стекло";
    if (kind === "backing") return "Задник";
    if (kind === "showcase") return "Товар витрины";
    if (kind === "accessory") {
      const g = row.accessoryGroup;
      return g ? ACCESSORY_GROUP_LABEL[g] : "Фурнитура";
    }
    return "Фурнитура";
  }

  return (
    <div className="bo-wh-shell">
      <div className="bo-wh-head">
        <div className="bo-wh-head__text">
          <h1 className="bo-page-title" style={{ marginBottom: 6 }}>
            Склад
          </h1>
          <p className="bo-page-subtitle" style={{ margin: 0, maxWidth: 720 }}>
            Поступления: документ с строками по багету, паспарту, стеклу, заднику, видам фурнитуры (как в «Материалах») и
            готовым товарам витрины.
            Проведение увеличивает остатки в каталогах и на витрине.
          </p>
        </div>
        <div className="bo-wh-head__actions">
          <button type="button" className="bo-btn bo-btn-primary" onClick={() => void newDraft()}>
            + Новое поступление
          </button>
        </div>
      </div>

      {createModal ? (
        <CreateCatalogFromWarehouseModal
          kind={createModal.kind}
          initialSku={createModal.sku}
          onClose={() => setCreateModal(null)}
          onCreated={async (sku) => {
            const idx = createModal.lineIndex;
            setCreateModal(null);
            await onCatalogCreated(sku, idx);
          }}
        />
      ) : null}

      {loading ? (
        <BoWarehouseSkeleton />
      ) : (
        <div className="bo-wh-split">
          <div className="bo-wh-panel">
            <div className="bo-wh-panel__head">
              <span>Документы поступления</span>
              <span className="bo-wh-panel__hint">{list.length} в списке</span>
            </div>
            <div className="bo-wh-panel__body">
              {list.length === 0 ? (
                <div className="bo-wh-empty-detail">
                  <p className="bo-wh-empty-detail__title">Пока нет документов</p>
                  <p className="bo-wh-empty-detail__text">
                    Создайте первое поступление — справа откроется форма: багет, паспарту, стекло, задник, виды фурнитуры и
                    товары витрины (поиск по названию).
                  </p>
                  <button type="button" className="bo-btn bo-btn-primary" onClick={() => void newDraft()}>
                    Создать поступление
                  </button>
                </div>
              ) : (
                <div className="bo-table-scroll bo-wh-table--dense">
                  <table className="bo-table">
                    <thead>
                      <tr>
                        <th>Номер</th>
                        <th>Статус</th>
                        <th style={{ width: 72, textAlign: "right" }}>Строк</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr
                          key={r.id}
                          className="bo-wh-doc-row"
                          data-active={selected?.id === r.id ? "true" : "false"}
                          onClick={() => openReceipt(r)}
                        >
                          <td>
                            <span style={{ fontWeight: 600, color: "var(--bo-text)" }}>{r.docNumber}</span>
                          </td>
                          <td>
                            <span
                              className={`bo-wh-status ${r.status === "draft" ? "bo-wh-status--draft" : "bo-wh-status--posted"}`}
                            >
                              {r.status === "draft" ? "Черновик" : "Проведён"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {r.lines?.length ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="bo-wh-panel">
            <div className="bo-wh-panel__head">
              <span>{selected ? selected.docNumber : "Документ не выбран"}</span>
              {selected ? (
                <span className="bo-wh-panel__hint">
                  {selected.status === "draft" ? "Редактирование черновика" : "Только просмотр"}
                </span>
              ) : (
                <span className="bo-wh-panel__hint">Выберите слева или создайте новый</span>
              )}
            </div>
            <div className="bo-wh-panel__body bo-wh-panel__body--padded">
            {!selected ? (
              <div className="bo-wh-empty-detail">
                <p className="bo-wh-empty-detail__title">Ничего не выбрано</p>
                <p className="bo-wh-empty-detail__text">
                  Нажмите на документ в списке слева, чтобы увидеть строки и комментарий. Или создайте новое
                  поступление — форма откроется здесь.
                </p>
                <button type="button" className="bo-btn bo-btn-primary" onClick={() => void newDraft()}>
                  + Новое поступление
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--bo-text-muted)", marginBottom: 18, lineHeight: 1.5 }}>
                  Создан: {new Date(selected.createdAt).toLocaleString("ru-RU")}
                  {selected.status === "posted" && selected.postedAt
                    ? ` · Проведён: ${new Date(selected.postedAt).toLocaleString("ru-RU")}`
                    : null}
                </div>
                <label style={{ display: "block", marginBottom: 18 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Комментарий</span>
                  <input
                    className="bo-input"
                    style={{ width: "100%", marginTop: 8 }}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={selected.status === "posted"}
                    placeholder="Поставщик, накладная…"
                  />
                </label>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Строки документа</div>
                <div className="bo-table-scroll">
                  <table className="bo-table bo-wh-table--dense">
                    <thead>
                      <tr>
                        <th style={{ width: 140 }}>Вид</th>
                        <th style={{ minWidth: 260 }}>Артикул</th>
                        <th style={{ width: 120 }}>Кол-во</th>
                        {selected.status === "draft" ? <th style={{ width: 48 }} /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((row, idx) => (
                        <tr key={idx}>
                          <td>
                            {selected.status === "posted" ? (
                              lineKindPostedLabel(row)
                            ) : (
                              <select
                                className="bo-select"
                                style={{ width: "100%" }}
                                value={receiptLineSelectValue(row, accessories)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setLines((p) =>
                                    p.map((x, i) => {
                                      if (i !== idx) return x;
                                      if (v.startsWith("accessory:")) {
                                        const suffix = v.slice("accessory:".length) as AccessoryGroupInv;
                                        return {
                                          ...x,
                                          kind: "accessory",
                                          accessoryGroup: suffix,
                                          sku: "",
                                        };
                                      }
                                      return {
                                        ...x,
                                        kind: v as ReceiptLine["kind"],
                                        accessoryGroup: undefined,
                                        sku: "",
                                      };
                                    })
                                  );
                                }}
                              >
                                <option value="frame">Багет (м)</option>
                                <option value="matboard">Паспарту (м²)</option>
                                <option value="glass">Стекло (м²)</option>
                                <option value="backing">Задник (м²)</option>
                                {ACCESSORY_RECEIPT_OPTIONS.map(({ suffix, label }) => (
                                  <option key={suffix} value={`accessory:${suffix}`}>
                                    {label}
                                  </option>
                                ))}
                                {canShowcaseStock ? (
                                  <option value="showcase">Товар витрины (шт)</option>
                                ) : null}
                              </select>
                            )}
                          </td>
                          <td style={{ verticalAlign: "top" }}>
                            {selected.status === "posted" ? (
                              row.kind === "showcase" ? (
                                <span>
                                  {showcaseTitleById.get(row.sku) ?? "—"}
                                  <span style={{ color: "var(--bo-text-muted)", marginLeft: 8 }}>{row.sku}</span>
                                </span>
                              ) : (
                                row.sku
                              )
                            ) : row.kind === "showcase" ? (
                              canShowcaseStock ? (
                                <WarehouseShowcasePicker
                                  value={row.sku}
                                  onChange={(sku) =>
                                    setLines((p) => p.map((x, i) => (i === idx ? { ...x, sku } : x)))
                                  }
                                  products={showcaseProducts}
                                  disabled={showcaseProductsLoading}
                                />
                              ) : (
                                <span style={{ color: "var(--bo-text-muted)" }}>Нет доступа к товарам витрины</span>
                              )
                            ) : (
                              <WarehouseSkuPicker
                                kind={row.kind}
                                value={row.sku}
                                onChange={(sku) =>
                                  setLines((p) => p.map((x, i) => (i === idx ? { ...x, sku } : x)))
                                }
                                frames={frames}
                                matboards={matboards}
                                glassItems={glassItems}
                                backingItems={backingItems}
                                accessories={accessories}
                                accessoryGroup={resolvedAccessoryGroup(row, accessories)}
                                disabled={inventoryLoading}
                                onCreateNew={
                                  row.kind === "accessory" ||
                                  row.kind === "glass" ||
                                  row.kind === "backing"
                                    ? undefined
                                    : (sku) => {
                                        const createKind = row.kind === "frame" ? "frame" : "matboard";
                                        setCreateModal({ kind: createKind, sku, lineIndex: idx });
                                      }
                                }
                              />
                            )}
                          </td>
                          <td>
                            {selected.status === "posted" ? (
                              row.quantity
                            ) : (
                              <input
                                type="number"
                                className="bo-input"
                                style={{ width: "100%" }}
                                min={row.kind === "showcase" ? 1 : 0}
                                step={
                                  row.kind === "showcase"
                                    ? "1"
                                    : row.kind === "frame"
                                      ? "0.001"
                                      : row.kind === "matboard" ||
                                          row.kind === "glass" ||
                                          row.kind === "backing"
                                        ? "0.0001"
                                        : row.kind === "accessory" && isAccessoryLinearGroup(row.accessoryGroup)
                                          ? "0.0001"
                                          : "1"
                                }
                                value={row.quantity || ""}
                                onChange={(e) =>
                                  setLines((p) =>
                                    p.map((x, i) =>
                                      i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x
                                    )
                                  )
                                }
                              />
                            )}
                          </td>
                          {selected.status === "draft" ? (
                            <td>
                              <button
                                type="button"
                                className="bo-btn bo-btn-ghost"
                                style={{ color: "#dc2626", padding: "4px 8px" }}
                                onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                              >
                                ×
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selected.status === "draft" ? (
                  <div
                    style={{
                      marginTop: 18,
                      paddingTop: 18,
                      borderTop: "1px solid var(--bo-border)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      className="bo-btn bo-btn-secondary"
                      onClick={() => setLines((p) => [...p, emptyLine()])}
                    >
                      + Строка
                    </button>
                    <button
                      type="button"
                      className="bo-btn bo-btn-primary"
                      disabled={saving}
                      onClick={() => void saveDraft()}
                    >
                      Сохранить черновик
                    </button>
                    <button
                      type="button"
                      className="bo-btn bo-btn-primary"
                      disabled={saving}
                      onClick={() => void postDoc()}
                    >
                      Провести документ
                    </button>
                    <button type="button" className="bo-btn bo-btn-ghost" onClick={() => void deleteDraft()}>
                      Удалить черновик
                    </button>
                  </div>
                ) : null}
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
