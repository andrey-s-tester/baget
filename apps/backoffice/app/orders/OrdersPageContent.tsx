"use client";

import dynamic from "next/dynamic";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import {
  accessoryCatalogFromMaterialsResponse,
  formatOrderOuterSizeMm,
  isRetailShowcaseOrder,
  orderToReceiptInput,
  printOrderReceipt,
  resolveAccessoryDisplay,
  SHOWCASE_RETAIL_CUSTOMER_NAME,
  type AccessoryCatalog
} from "@yanak/receipt";
import { useBackofficeSession } from "../components/BackofficeSession";
import { BoTablePageSkeleton } from "../components/BoPageSkeleton";

const AddOrderModal = dynamic(
  () => import("./AddOrderModal").then((m) => ({ default: m.AddOrderModal })),
  { loading: () => <div className="bo-empty" style={{ padding: 32 }}>Загрузка формы заказа…</div> }
);

const VisualOrderCheckoutModal = dynamic(
  () => import("./VisualOrderCheckoutModal").then((m) => ({ default: m.VisualOrderCheckoutModal })),
  { loading: () => null }
);

const VisualConstructor = dynamic(
  () => import("./VisualConstructorApp").then((m) => ({ default: m.ConstructorApp })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "min(100%, 710px)",
          maxWidth: 710,
          minHeight: 420,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box"
        }}
      >
        <p className="bo-empty" style={{ margin: 0, textAlign: "center" }}>
          Загрузка конструктора…
        </p>
      </div>
    )
  }
);

type OrderStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "assembly"
  | "waiting_materials"
  | "ready"
  | "issued"
  | "cancelled";

type Order = {
  id: string;
  /** Публичный номер; для старых ответов без поля — показываем id. */
  orderNumber?: string;
  createdAt: string;
  status: string;
  customerName: string;
  phone: string;
  email?: string;
  store: string;
  comment?: string;
  total: number;
  config: Record<string, unknown>;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  assigned: "Назначен",
  in_progress: "В работе",
  assembly: "Сборка",
  waiting_materials: "Ожидание материалов",
  ready: "Готов",
  issued: "Выдан",
  cancelled: "Отменён"
};

const STATUS_COLORS: Record<string, string> = {
  new: "#2563eb",
  assigned: "#7c3aed",
  in_progress: "#ea580c",
  assembly: "#ca8a04",
  waiting_materials: "#dc2626",
  ready: "#16a34a",
  issued: "#15803d",
  cancelled: "#6b7280"
};

type Store = { id: string; name: string; isActive: boolean };

const STATUS_TABS: { value: OrderStatus | ""; label: string }[] = [
  { value: "", label: "Все" },
  ...(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([value, label]) => ({ value, label })),
];

export function OrdersPageContent() {
  const pathname = usePathname();
  const initialMainTab = useMemo(() => (pathname === "/orders/history" ? "history" : "orders"), [pathname]);
  const { user, refresh: refreshSession } = useBackofficeSession();
  const canDeleteOrders = user?.role === "owner" || user?.role === "admin";
  const [orders, setOrders] = useState<Order[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("");
  const [statusTab, setStatusTab] = useState<OrderStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<"orders" | "history">(initialMainTab);
  const [createMode, setCreateMode] = useState<"simple" | "visual">("simple");
  /** После первого открытия «Визуальный» не размонтируем конструктор — переключения Простой↔Визуальный без повторной загрузки чанка. */
  const [visualConstructorMounted, setVisualConstructorMounted] = useState(false);
  const [visualCheckout, setVisualCheckout] = useState<{
    total: number;
    config: Record<string, unknown>;
    priceDetailLine?: string;
  } | null>(null);
  const [accessoryCatalog, setAccessoryCatalog] = useState<AccessoryCatalog | null>(null);
  const [showToolbarProductPicker, setShowToolbarProductPicker] = useState(false);

  useEffect(() => {
    fetch("/api/materials", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => setAccessoryCatalog(accessoryCatalogFromMaterialsResponse(raw)))
      .catch(() => setAccessoryCatalog(null));
  }, []);

  async function loadOrders(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const [ordRes, storeRes] = await Promise.all([
        fetch("/api/orders", { credentials: "include", cache: "no-store" }),
        fetch("/api/stores", { credentials: "include", cache: "no-store" })
      ]);
      const ordData = await ordRes.json();
      const storeData = await storeRes.json();
      setOrders(Array.isArray(ordData) ? ordData : []);
      setStores(Array.isArray(storeData) ? storeData : []);
    } catch {
      setOrders([]);
      setStores([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  useEffect(() => {
    setMainTab(pathname === "/orders/history" ? "history" : "orders");
  }, [pathname]);

  const webOrigin = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000";
    try {
      return new URL(raw).origin;
    } catch {
      return raw;
    }
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== webOrigin) return;
      const data = event.data as unknown;
      if (!data || typeof data !== "object") return;
      const maybe = data as { type?: unknown };
      if (maybe.type === "YANAK_ORDER_CREATED") {
        setMainTab("history");
        void loadOrders();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [webOrigin]);

  async function patchOrderStatus(orderId: string, status: OrderStatus) {
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status })
      });
      const data = await res.json();
      if (data.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        toast.success("Статус обновлён");
      } else {
        toast.error(data.message || "Ошибка обновления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  async function deleteOrder(orderId: string) {
    if (!canDeleteOrders) {
      toast.error("Удаление заказов доступно только владельцу и администратору");
      return;
    }
    if (!confirm("Удалить заказ?")) return;
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId }),
      });
      const data = await res.json();
      if (data.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        toast.success("Заказ удалён");
      } else {
        toast.error(data.message || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  }

  const filteredOrders = orders
    .filter((o) => !storeFilter || o.store === storeFilter)
    .filter((o) => !statusTab || o.status === statusTab);

  return (
    <>
      <div className="bo-orders-toolbar">
        <div className="bo-orders-toolbar__inner">
          <div className="bo-orders-toolbar__group" role="tablist" aria-label="Раздел заказов">
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "orders"}
              className={`bo-orders-toolbar__tab ${mainTab === "orders" ? "bo-orders-toolbar__tab--active" : ""}`}
              onClick={() => setMainTab("orders")}
            >
              Оформление
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "history"}
              className={`bo-orders-toolbar__tab ${mainTab === "history" ? "bo-orders-toolbar__tab--active" : ""}`}
              onClick={() => setMainTab("history")}
            >
              История
            </button>
          </div>
          {mainTab === "orders" ? (
            <div className="bo-orders-toolbar__group" role="tablist" aria-label="Тип заказа">
              <button
                type="button"
                role="tab"
                aria-selected={createMode === "simple"}
                className={`bo-orders-toolbar__tab ${createMode === "simple" ? "bo-orders-toolbar__tab--active" : ""}`}
                onClick={() => setCreateMode("simple")}
              >
                Простой
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={createMode === "visual"}
                className={`bo-orders-toolbar__tab ${createMode === "visual" ? "bo-orders-toolbar__tab--active" : ""}`}
                onClick={() => {
                  setCreateMode("visual");
                  setVisualConstructorMounted(true);
                }}
              >
                Визуальный
              </button>
            </div>
          ) : null}
          <div className="bo-orders-toolbar__group bo-orders-toolbar__actions">
            {mainTab === "history" ? (
              <button type="button" className="bo-btn bo-btn-secondary" onClick={() => void loadOrders()}>
                Обновить список
              </button>
            ) : null}
            <button
              type="button"
              className="bo-btn bo-btn-secondary"
              onClick={() => {
                void refreshSession();
                setShowToolbarProductPicker(true);
              }}
            >
              Товары
            </button>
          </div>
        </div>
      </div>

      {mainTab === "orders" ? (
        <div
          className={`bo-card bo-card-body${createMode === "visual" ? " bo-card--visual-constructor" : ""}`}
        >
          <div
            style={{
              display: createMode === "simple" ? "block" : "none",
              minWidth: 0,
              width: "100%"
            }}
            aria-hidden={createMode !== "simple"}
          >
            <AddOrderModal
              onClose={() => {
                setCreateMode("visual");
                setVisualConstructorMounted(true);
              }}
              onCreated={() => void loadOrders({ silent: true })}
              onGoToHistory={() => {
                setMainTab("history");
                void loadOrders();
              }}
              mode="inline"
            />
          </div>
          {visualConstructorMounted ? (
            <div
              style={{
                display: createMode === "visual" ? "flex" : "none",
                flexDirection: "column",
                gap: 12,
                minWidth: 0,
                width: "100%"
              }}
              aria-hidden={createMode !== "visual"}
            >
              <div
                className="embed-constructor-shell"
                style={{
                  border: "1px solid var(--bo-border)",
                  borderRadius: 8,
                  overflowX: "clip",
                  overflowY: "auto",
                  background: "#fff",
                  maxHeight: "min(72vh, 920px)",
                  minWidth: 0,
                  width: "100%"
                }}
              >
                <VisualConstructor
                  embed
                  onEmbedCheckout={(data) => {
                    setVisualCheckout({
                      total: data.total,
                      config: data.config,
                      priceDetailLine: data.priceDetailLine
                    });
                  }}
                />
              </div>
            </div>
          ) : null}
          <VisualOrderCheckoutModal
            open={visualCheckout !== null}
            onClose={() => setVisualCheckout(null)}
            draft={visualCheckout}
            priceDetailLine={visualCheckout?.priceDetailLine}
            onSuccess={() => void loadOrders({ silent: true })}
          />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {STATUS_TABS.map((tab) => {
              const count =
                tab.value === ""
                  ? orders.filter((o) => !storeFilter || o.store === storeFilter).length
                  : orders.filter((o) => o.status === tab.value && (!storeFilter || o.store === storeFilter)).length;
              const isActive = statusTab === tab.value;
              return (
                <button
                  key={tab.value || "all"}
                  type="button"
                  onClick={() => setStatusTab(tab.value)}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 8,
                    border: `1px solid ${isActive ? "var(--bo-accent)" : "var(--bo-border)"}`,
                    background: isActive ? "rgba(59, 130, 246, 0.1)" : "var(--bo-surface)",
                    color: isActive ? "var(--bo-accent)" : "var(--bo-text)",
                    cursor: "pointer",
                  }}
                >
                  {tab.label} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          {stores.length > 0 && (
            <div className="bo-form-row" style={{ marginBottom: 16 }}>
              <label>
                <span>Магазин</span>
                <select
                  className="bo-select"
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  style={{ minWidth: 200 }}
                >
                  <option value="">Все магазины</option>
                  {stores.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {loading ? (
            <BoTablePageSkeleton titleWidth={180} omitPageHeader />
          ) : filteredOrders.length === 0 ? (
            <div className="bo-card bo-empty">
              <strong>Заказов пока нет</strong>
              {statusTab || storeFilter
                ? "Попробуйте изменить фильтр или вкладку"
                : "Заказы создаются в конструкторе на основном сайте"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  accessoryCatalog={accessoryCatalog}
                  onStatusChange={(status) => patchOrderStatus(order.id, status)}
                  canDeleteOrders={canDeleteOrders}
                  onDelete={() => deleteOrder(order.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ShowcaseSaleModal
        open={showToolbarProductPicker}
        onClose={() => setShowToolbarProductPicker(false)}
        onCreated={() => void loadOrders({ silent: true })}
        sellerStoreName={user?.sellerStoreName?.trim() || null}
      />
    </>
  );
}

type ShowcaseProductRow = {
  id: string;
  title: string;
  artist: string;
  sizeLabel: string;
  priceRub: number;
  imageUrl: string;
  stockQty: number;
  inStock: boolean;
  isActive: boolean;
};

function ShowcaseSaleModal({
  open,
  onClose,
  onCreated,
  sellerStoreName,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  sellerStoreName: string | null;
}) {
  const [step, setStep] = useState<"catalog" | "checkout">("catalog");
  const [products, setProducts] = useState<ShowcaseProductRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selected, setSelected] = useState<ShowcaseProductRow | null>(null);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("catalog");
    setSelected(null);
    setQty(1);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCatalog(true);
    fetch("/api/products", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setProducts(
          arr
            .filter((p): p is ShowcaseProductRow => {
              if (!p || typeof p !== "object") return false;
              const row = p as ShowcaseProductRow;
              return typeof row.id === "string" && row.isActive === true;
            })
            .map((p) => ({
              ...p,
              stockQty: Math.max(0, Math.floor(Number(p.stockQty) || 0)),
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const store = sellerStoreName?.trim() || "";
    if (!store) {
      toast.error("У вашей учётной записи не указан магазин. Администратор должен привязать сотрудника к магазину.");
      return;
    }
    const rawQ = Math.floor(Number(qty)) || 1;
    const q = Math.max(1, Math.min(Math.min(99, selected.stockQty), rawQ));
    if (selected.stockQty < q) {
      toast.error("Недостаточно товара на складе витрины");
      return;
    }
    const unit = Number(selected.priceRub);
    const total = unit * q;
    const showcaseSaleDescription = `${selected.title} · ${selected.artist} · ${selected.sizeLabel}`;
    const config: Record<string, unknown> = {
      showcaseSaleOnly: true,
      showcaseSaleDescription,
      soldShowcaseProducts: [
        {
          id: selected.id,
          title: selected.title,
          artist: selected.artist,
          sizeLabel: selected.sizeLabel,
          priceRub: unit,
          qty: q,
          imageUrl: selected.imageUrl,
        },
      ],
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          customerName: SHOWCASE_RETAIL_CUSTOMER_NAME,
          store,
          total,
          config,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string | string[] };
      if (res.ok && data.ok) {
        toast.success("Заказ создан, товар записан как проданный с витрины");
        onCreated();
        onClose();
      } else {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message;
        toast.error(msg || "Не удалось создать заказ");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        className="bo-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div
          className="bo-card-body"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {step === "catalog" ? "Витрина" : "Оформить заказ"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 24,
                cursor: "pointer",
                color: "#64748b",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {step === "catalog" ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--bo-text-muted)" }}>
                Выберите товар и нажмите «Выбрать», укажите количество и оформите заказ. Магазин подставляется из вашего
                профиля продавца.
              </p>
              <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {loadingCatalog ? (
                  <div className="bo-empty" style={{ padding: 24 }}>
                    Загрузка…
                  </div>
                ) : products.length === 0 ? (
                  <div className="bo-empty" style={{ padding: 24 }}>
                    Нет активных товаров в каталоге
                  </div>
                ) : (
                  products.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid var(--bo-border)",
                        borderRadius: 8,
                        background: "var(--bo-surface-2, #f8fafc)",
                      }}
                    >
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          width={56}
                          height={56}
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {p.artist} · {p.sizeLabel}
                          {p.stockQty < 1 ? " · нет на складе" : ` · на складе: ${p.stockQty} шт.`}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                          {Number(p.priceRub).toLocaleString("ru-RU")} руб.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="bo-btn bo-btn-primary"
                        style={{ flexShrink: 0, fontSize: 13 }}
                        disabled={p.stockQty < 1}
                        onClick={() => {
                          setSelected(p);
                          setQty(1);
                          setStep("checkout");
                        }}
                      >
                        Выбрать
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {selected ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid var(--bo-border)",
                    background: "var(--bo-surface-2, #f8fafc)",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{selected.title}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {selected.artist} · {selected.sizeLabel}
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    {Number(selected.priceRub).toLocaleString("ru-RU")} руб. за шт. · доступно {selected.stockQty} шт.
                  </div>
                </div>
              ) : null}

              <div
                className="bo-form-row"
                style={{ fontSize: 14, padding: "10px 12px", background: "var(--bo-surface-2, #f8fafc)", borderRadius: 8 }}
              >
                <span style={{ color: "var(--bo-text-muted)" }}>Магазин (карточка сотрудника)</span>
                <strong>{sellerStoreName?.trim() || "— не указан —"}</strong>
              </div>

              <label className="bo-form-row">
                <span>Количество</span>
                <input
                  type="number"
                  className="bo-input"
                  min={1}
                  max={selected ? Math.min(99, selected.stockQty) : 99}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </label>

              {selected ? (
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  К оплате:{" "}
                  {(
                    Number(selected.priceRub) *
                    Math.max(1, Math.min(selected.stockQty, Math.min(99, Math.floor(Number(qty)) || 1)))
                  ).toLocaleString("ru-RU")}{" "}
                  руб.
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <button
                  type="button"
                  className="bo-btn bo-btn-ghost"
                  onClick={() => {
                    setStep("catalog");
                    setSelected(null);
                  }}
                  disabled={submitting}
                >
                  ← К витрине
                </button>
                <button
                  type="submit"
                  className="bo-btn bo-btn-primary"
                  disabled={submitting || !selected || !sellerStoreName?.trim()}
                >
                  {submitting ? "…" : "Оформить заказ"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const GLASS_LABELS: Record<string, string> = {
  none: "Нет",
  regular: "Обычное",
  matte: "Матовое",
  anti_glare: "Антиблик",
  acrylic: "Пластиковое",
};

const BACKING_LABELS: Record<string, string> = {
  none: "Нет",
  cardboard: "Картон",
  foam5: "Пенокартон 5 мм",
  stretch: "Натяжка вышивки",
  stretcher: "Подрамник",
};

function OrderCard({
  order,
  accessoryCatalog,
  onStatusChange,
  canDeleteOrders,
  onDelete,
}: {
  order: Order;
  accessoryCatalog: AccessoryCatalog | null;
  onStatusChange: (status: OrderStatus) => void;
  canDeleteOrders: boolean;
  onDelete: () => void;
}) {
  const cfg = order.config as {
    showcaseSaleOnly?: boolean;
    showcaseSaleDescription?: string;
    widthMm?: number;
    heightMm?: number;
    selectedSku?: string;
    frameLayers?: { sku?: string; profileWidthMm?: number }[];
    framePricePerMeter?: number;
    glassId?: string;
    backingId?: string;
    useMatboard?: boolean;
    matboardLayers?: { sku?: string; marginMm?: number }[];
    matboardWidthMm?: number;
    selectedMatboardSku?: string;
    hangerId?: string;
    hangerName?: string;
    quantity?: number;
    subframeId?: string;
    subframeName?: string;
    finishingId?: string;
    finishingName?: string;
    assemblyProductId?: string;
    assemblyProductName?: string;
    standLegId?: string;
    standLegName?: string;
    outerWidthMm?: number;
    outerHeightMm?: number;
  };
  const statusColor = STATUS_COLORS[order.status] ?? "#666";
  const isRetailShowcase = isRetailShowcaseOrder(order);
  const [showDetails, setShowDetails] = useState(false);
  const qty = Math.max(1, Math.floor(Number(cfg.quantity) || 1));

  function printReceipt() {
    const statusLabel = isRetailShowcase
      ? "Витрина"
      : STATUS_LABELS[order.status as OrderStatus] ?? order.status;
    const input = orderToReceiptInput(
      order,
      statusLabel,
      accessoryCatalog ? { accessoryCatalog } : undefined
    );
    if (!printOrderReceipt(input)) {
      toast.error("Разрешите всплывающие окна для печати квитанции");
    }
  }

  return (
    <div className="bo-card bo-card-body">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            <span>
              {(order.orderNumber ?? order.id)} · {order.customerName}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#555" }}>
            {order.phone}
            {order.email ? ` · ${order.email}` : ""}
            {order.store ? ` · ${order.store}` : ""}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
            {new Date(order.createdAt).toLocaleString("ru-RU")}
            {cfg.showcaseSaleOnly ? (
              <>
                {" · "}
                <span style={{ color: "var(--bo-accent)" }}>Витрина</span>
                {cfg.showcaseSaleDescription ? ` · ${cfg.showcaseSaleDescription}` : ""}
              </>
            ) : (
              <>
                {cfg.widthMm && cfg.heightMm ? ` · ${cfg.widthMm}×${cfg.heightMm} мм` : ""}
                {cfg.selectedSku ? ` · Арт. ${cfg.selectedSku}` : ""}
                {` · ${qty} шт.`}
              </>
            )}
          </div>
          {order.comment && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontStyle: "italic" }}>
              {order.comment}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {Number(order.total).toLocaleString("ru-RU")} руб.
          </div>
          <button
            type="button"
            className="bo-btn bo-btn-ghost"
            onClick={() => setShowDetails(true)}
            style={{ fontSize: 13 }}
          >
            Детальная информация
          </button>
          <button type="button" className="bo-btn bo-btn-ghost" onClick={printReceipt} style={{ fontSize: 13 }}>
            Квитанция
          </button>
          {!isRetailShowcase ? (
            <select
              className="bo-select"
              value={order.status}
              onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
              style={{ borderColor: statusColor, color: statusColor, cursor: "pointer", minWidth: 140 }}
            >
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : null}
          {canDeleteOrders ? (
            <button
              type="button"
              className="bo-btn bo-btn-ghost"
              onClick={onDelete}
              style={{ color: "#dc2626", fontSize: 13 }}
            >
              Удалить
            </button>
          ) : null}
        </div>
      </div>

      {showDetails && (
        <OrderDetailsModal
          order={order}
          accessoryCatalog={accessoryCatalog}
          canDeleteOrders={canDeleteOrders}
          onClose={() => setShowDetails(false)}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onPrintReceipt={printReceipt}
        />
      )}
    </div>
  );
}

function OrderDetailsModal({
  order,
  accessoryCatalog,
  canDeleteOrders,
  onClose,
  onStatusChange,
  onDelete,
  onPrintReceipt,
}: {
  order: Order;
  accessoryCatalog: AccessoryCatalog | null;
  canDeleteOrders: boolean;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onDelete: () => void;
  onPrintReceipt: () => void;
}) {
  const cfg = order.config as {
    showcaseSaleOnly?: boolean;
    showcaseSaleDescription?: string;
    widthMm?: number;
    heightMm?: number;
    selectedSku?: string;
    frameLayers?: { sku?: string; profileWidthMm?: number }[];
    framePricePerMeter?: number;
    glassId?: string;
    backingId?: string;
    useMatboard?: boolean;
    matboardLayers?: { sku?: string; marginMm?: number }[];
    matboardWidthMm?: number;
    selectedMatboardSku?: string;
    hangerId?: string;
    hangerName?: string;
    quantity?: number;
    subframeId?: string;
    subframeName?: string;
    finishingId?: string;
    finishingName?: string;
    assemblyProductId?: string;
    assemblyProductName?: string;
    standLegId?: string;
    standLegName?: string;
    outerWidthMm?: number;
    outerHeightMm?: number;
    soldShowcaseProducts?: Array<{
      id?: string;
      title?: string;
      artist?: string;
      sizeLabel?: string;
      priceRub?: number;
      qty?: number;
    }>;
  };
  const statusColor = STATUS_COLORS[order.status] ?? "#666";
  const qty = Math.max(1, Math.floor(Number(cfg.quantity) || 1));
  const outerSizeLabel = formatOrderOuterSizeMm(order.config);
  const isShowcaseOnly = cfg.showcaseSaleOnly === true;
  const hideStatusUi = isRetailShowcaseOrder(order);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="bo-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: "95%", maxHeight: "90vh", overflow: "auto" }}
      >
        <div className="bo-card-body" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Заказ {order.orderNumber ?? order.id}
            </h2>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b", lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase" }}>
              Клиент
            </h3>
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bo-text-muted)" }}>Имя</span>
                <span>{order.customerName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bo-text-muted)" }}>Телефон</span>
                <a href={`tel:${order.phone}`}>{order.phone}</a>
              </div>
              {order.email && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Email</span>
                  <a href={`mailto:${order.email}`}>{order.email}</a>
                </div>
              )}
              {order.store && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Магазин</span>
                  <span>{order.store}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bo-text-muted)" }}>Дата создания</span>
                <span>{new Date(order.createdAt).toLocaleString("ru-RU")}</span>
              </div>
            </div>
          </section>

          {!isShowcaseOnly ? (
          <section style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase" }}>
              Параметры заказа
            </h3>
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              {(cfg.widthMm || cfg.heightMm) && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Размер проёма</span>
                  <span>
                    {cfg.widthMm} × {cfg.heightMm} мм
                  </span>
                </div>
              )}
              {!isShowcaseOnly ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Количество рамок</span>
                  <span>{qty} шт.</span>
                </div>
              ) : null}
              {outerSizeLabel !== "—" ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Снаружи</span>
                  <span>{outerSizeLabel}</span>
                </div>
              ) : null}
              {cfg.selectedSku && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Багет (артикул)</span>
                  <span>Арт. {cfg.selectedSku}</span>
                </div>
              )}
              {Array.isArray(cfg.frameLayers) && cfg.frameLayers.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {cfg.frameLayers.map((layer: { sku?: string; profileWidthMm?: number }, idx: number) => (
                    <div key={`frame-${idx}`} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--bo-text-muted)" }}>Слой багета {idx + 1}</span>
                      <span>
                        {layer.sku || "—"}
                        {layer.profileWidthMm != null ? ` · ${Number(layer.profileWidthMm)} мм` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {cfg.framePricePerMeter != null && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Цена багета за м</span>
                  <span>{Number(cfg.framePricePerMeter).toLocaleString("ru-RU")} руб.</span>
                </div>
              )}
              {cfg.glassId && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Стекло</span>
                  <span>{GLASS_LABELS[cfg.glassId] ?? cfg.glassId}</span>
                </div>
              )}
              {cfg.backingId && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Задник</span>
                  <span>{BACKING_LABELS[cfg.backingId] ?? cfg.backingId}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bo-text-muted)" }}>Паспарту</span>
                <span>{(cfg.matboardLayers?.length ?? 0) > 0 || cfg.useMatboard ? "Да" : "Нет"}</span>
              </div>
              {(cfg.matboardLayers?.length ?? 0) > 0 || cfg.useMatboard ? (
                <>
                  {Array.isArray(cfg.matboardLayers) && cfg.matboardLayers.length > 0 ? (
                    cfg.matboardLayers.map((layer: { sku?: string; marginMm?: number }, idx: number) => (
                      <div key={`mb-${idx}`} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--bo-text-muted)" }}>Слой паспарту {idx + 1}</span>
                        <span>
                          {(layer.sku || "—")}{layer.marginMm != null ? ` · ${Number(layer.marginMm)} мм` : ""}
                        </span>
                      </div>
                    ))
                  ) : null}
                  {cfg.selectedMatboardSku ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--bo-text-muted)" }}>Паспарту (артикул)</span>
                      <span>{cfg.selectedMatboardSku}</span>
                    </div>
                  ) : null}
                  {cfg.matboardWidthMm != null ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--bo-text-muted)" }}>Поле паспарту</span>
                      <span>{Number(cfg.matboardWidthMm)} мм</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {cfg.hangerId ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Подвес</span>
                  <span>{resolveAccessoryDisplay(cfg.hangerId, cfg.hangerName, accessoryCatalog?.hangers)}</span>
                </div>
              ) : null}
              {cfg.subframeId ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Подрамник</span>
                  <span>{resolveAccessoryDisplay(cfg.subframeId, cfg.subframeName, accessoryCatalog?.subframes)}</span>
                </div>
              ) : null}
              {cfg.finishingId ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Изделие</span>
                  <span>
                    {resolveAccessoryDisplay(cfg.finishingId, cfg.finishingName, accessoryCatalog?.finishings)}
                  </span>
                </div>
              ) : null}
              {cfg.assemblyProductId ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>По оформлению</span>
                  <span>
                    {resolveAccessoryDisplay(
                      cfg.assemblyProductId,
                      cfg.assemblyProductName,
                      accessoryCatalog?.assemblyProducts
                    )}
                  </span>
                </div>
              ) : null}
              {cfg.standLegId ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--bo-text-muted)" }}>Ножка</span>
                  <span>{resolveAccessoryDisplay(cfg.standLegId, cfg.standLegName, accessoryCatalog?.standLegs)}</span>
                </div>
              ) : null}
            </div>
          </section>
          ) : (
            <section style={{ marginBottom: 20 }}>
              <h3
                style={{
                  margin: "0 0 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--bo-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Продажа с витрины
              </h3>
              {cfg.showcaseSaleDescription ? (
                <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>{cfg.showcaseSaleDescription}</p>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 14 }}>
                <span style={{ color: "var(--bo-text-muted)" }}>Магазин</span>
                <span>{order.store || "—"}</span>
              </div>
              {Array.isArray(cfg.soldShowcaseProducts) && cfg.soldShowcaseProducts.length > 0 ? (
                <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                  {cfg.soldShowcaseProducts.map((line, idx) => {
                    const q = Math.max(1, Math.floor(Number(line.qty) || 1));
                    const unit = Number(line.priceRub) || 0;
                    const sub = q * unit;
                    return (
                      <div
                        key={line.id ?? `sold-${idx}`}
                        style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
                      >
                        <span>
                          {line.title ?? "—"}
                          {line.artist ? ` · ${line.artist}` : ""}
                          {line.sizeLabel ? ` · ${line.sizeLabel}` : ""}
                        </span>
                        <span style={{ whiteSpace: "nowrap" }}>
                          {q} × {unit.toLocaleString("ru-RU")} = {sub.toLocaleString("ru-RU")} руб.
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          )}

          {!isShowcaseOnly && Array.isArray(cfg.soldShowcaseProducts) && cfg.soldShowcaseProducts.length > 0 ? (
            <section style={{ marginBottom: 20 }}>
              <h3
                style={{
                  margin: "0 0 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--bo-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Товары (витрина)
              </h3>
              <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                {cfg.soldShowcaseProducts.map((line, idx) => {
                  const q = Math.max(1, Math.floor(Number(line.qty) || 1));
                  const unit = Number(line.priceRub) || 0;
                  const sub = q * unit;
                  return (
                    <div
                      key={line.id ?? `sold-${idx}`}
                      style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
                    >
                      <span>
                        {line.title ?? "—"}
                        {line.artist ? ` · ${line.artist}` : ""}
                        {line.sizeLabel ? ` · ${line.sizeLabel}` : ""}
                      </span>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {q} × {unit.toLocaleString("ru-RU")} = {sub.toLocaleString("ru-RU")} руб.
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {order.comment && (
            <section style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase" }}>
                Комментарий
              </h3>
              <p style={{ margin: 0, fontSize: 14 }}>{order.comment}</p>
            </section>
          )}

          <section style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid var(--bo-border)" }}>
            {!hideStatusUi ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: "var(--bo-text-muted)" }}>Статус</span>
                <select
                  className="bo-select"
                  value={order.status}
                  onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
                  style={{ borderColor: statusColor, color: statusColor, cursor: "pointer", minWidth: 140 }}
                >
                  {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18, fontWeight: 700 }}>
              <span>Итого</span>
              <span style={{ color: "var(--bo-accent)" }}>{Number(order.total).toLocaleString("ru-RU")} руб.</span>
            </div>
          </section>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="bo-btn bo-btn-primary" onClick={onPrintReceipt}>
              Распечатать квитанцию
            </button>
            <button
              type="button"
              className="bo-btn bo-btn-secondary"
              onClick={onClose}
            >
              Закрыть
            </button>
            {canDeleteOrders ? (
              <button
                type="button"
                className="bo-btn bo-btn-ghost"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                style={{ color: "#dc2626", marginLeft: "auto" }}
              >
                Удалить заказ
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
