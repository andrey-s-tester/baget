"use client";

import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  accessoryCatalogFromMaterialsResponse,
  printOrderReceipt,
  type AccessoryCatalog,
  type OrderReceiptInput
} from "@yanak/receipt";

type StoreItem = { id: string; name: string; address?: string; isActive?: boolean };

type CustomerLookup = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  orderIds: string[];
};

const PHONE_373_DIGITS = "373";
const PHONE_LOCAL_MAX_DIGITS = 9;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function maskPhone373(input: string) {
  const d = digitsOnly(input);
  if (!d) return "";
  const local = d.startsWith(PHONE_373_DIGITS) ? d.slice(PHONE_373_DIGITS.length) : d;
  const localTrimmed = local.slice(0, PHONE_LOCAL_MAX_DIGITS);
  return `+${PHONE_373_DIGITS}${localTrimmed}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  draft: { total: number; config: Record<string, unknown> } | null;
  priceDetailLine?: string | null;
  onSuccess: () => void;
};

export function VisualOrderCheckoutModal({ open, onClose, draft, priceDetailLine, onSuccess }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [store, setStore] = useState("");
  const [comment, setComment] = useState("");
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [customerLookup, setCustomerLookup] = useState<CustomerLookup | null>(null);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [receiptSnapshot, setReceiptSnapshot] = useState<OrderReceiptInput | null>(null);
  const [accessoryCatalog, setAccessoryCatalog] = useState<AccessoryCatalog | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/materials", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => setAccessoryCatalog(accessoryCatalogFromMaterialsResponse(raw)))
      .catch(() => setAccessoryCatalog(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess(false);
    setReceiptSnapshot(null);
    setSubmitting(false);
    setCustomerLookup(null);
    setPhoneSearching(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/stores", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: StoreItem[]) => {
        const active = Array.isArray(list) ? list.filter((s) => s.isActive !== false) : [];
        setStores(active);
        setStore((prev) => prev || (active[0] as StoreItem | undefined)?.name || "");
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const digits = digitsOnly(phone);
    if (!digits) {
      setCustomerLookup(null);
      return;
    }

    const normalizedDigits = digits.startsWith(PHONE_373_DIGITS) ? digits : `${PHONE_373_DIGITS}${digits}`;
    const localDigits = normalizedDigits.slice(PHONE_373_DIGITS.length);
    if (localDigits.length < 7) {
      setCustomerLookup(null);
      return;
    }

    const queryPhone = `+${normalizedDigits}`;
    const queryCandidates = new Set<string>([digits, localDigits, normalizedDigits]);

    const t = window.setTimeout(async () => {
      setPhoneSearching(true);
      try {
        const res = await fetch(`/api/customers?phone=${encodeURIComponent(queryPhone)}`, {
          credentials: "include",
          cache: "no-store"
        });
        const data = await res.json();
        if (data && typeof data === "object" && !Array.isArray(data) && data !== null && "name" in data) {
          const row = data as CustomerLookup & { orderIds?: string[] };
          setCustomerLookup({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            orderIds: row.orderIds ?? []
          });
          if (typeof row.name === "string") setCustomerName(row.name);
          setEmail(row.email ?? "");
          return;
        }

        const listRes = await fetch("/api/customers", { credentials: "include", cache: "no-store" });
        const list = (await listRes.json()) as Array<{
          phone?: string;
          id?: string;
          name?: string;
          email?: string;
          orderIds?: string[];
        }>;

        const match = list.find((c) => {
          const cDigits = c.phone ? digitsOnly(c.phone) : "";
          if (!cDigits) return false;
          return queryCandidates.has(cDigits);
        });

        if (match && match.name) {
          setCustomerLookup({
            id: match.id ?? "",
            name: match.name ?? "",
            phone: match.phone ?? "",
            email: match.email ?? undefined,
            orderIds: match.orderIds ?? []
          });
          setCustomerName(match.name ?? "");
          setEmail(match.email ?? "");
        } else {
          setCustomerLookup(null);
        }
      } catch {
        setCustomerLookup(null);
      } finally {
        setPhoneSearching(false);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [phone, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) return;
    if (!draft) {
      setError("Нет данных заказа.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          store: store.trim() || undefined,
          comment: comment.trim() || undefined,
          total: draft.total,
          config: draft.config
        })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        id?: string;
        orderId?: string;
        orderNumber?: string;
        message?: string | string[];
      };

      if (response.ok && data.ok) {
        const internalId = String(data.orderId ?? data.id ?? "").trim() || "—";
        const pub = String(data.orderNumber ?? "").trim();
        let catForReceipt = accessoryCatalog;
        if (!catForReceipt) {
          try {
            const mr = await fetch("/api/materials", { credentials: "include", cache: "no-store" });
            if (mr.ok) {
              catForReceipt = accessoryCatalogFromMaterialsResponse(await mr.json());
            }
          } catch {
            catForReceipt = null;
          }
        }
        if (draft) {
          setReceiptSnapshot({
            orderId: internalId,
            ...(pub ? { orderNumber: pub } : {}),
            createdAtIso: new Date().toISOString(),
            customerName: customerName.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            store: store.trim() || undefined,
            comment: comment.trim() || undefined,
            total: draft.total,
            statusLabel: "Новый",
            priceDetailLine: priceDetailLine ?? undefined,
            config: draft.config,
            ...(catForReceipt ? { accessoryCatalog: catForReceipt } : {})
          });
        }
        toast.success("Заказ создан");
        setSuccess(true);
        onSuccess();
      } else {
        const msg =
          typeof data.message === "string"
            ? data.message
            : Array.isArray(data.message)
              ? data.message.join(" ")
              : "Не удалось оформить заказ.";
        setError(msg);
      }
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="visual-checkout-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.45)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "24px 16px 32px"
      }}
      onClick={onClose}
    >
      <div
        className="bo-card"
        style={{
          width: "min(680px, calc(100vw - 32px))",
          maxWidth: 680,
          flexShrink: 0,
          marginTop: 12,
          marginBottom: 32,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: "1px solid var(--bo-border)"
          }}
        >
          <strong id="visual-checkout-title">{success ? "Заказ принят" : "Оформление заказа (визуальный конструктор)"}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "var(--bo-text-muted)" }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="bo-card-body" style={{ padding: 16 }}>
          {success ? (
            <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
              <p style={{ margin: "0 0 16px", color: "var(--bo-text-muted)", lineHeight: 1.5 }}>С вами свяжутся в ближайшее время.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
                {receiptSnapshot ? (
                  <button
                    type="button"
                    className="bo-btn bo-btn-secondary"
                    style={{ minHeight: 44 }}
                    onClick={() => {
                      if (!printOrderReceipt(receiptSnapshot)) {
                        toast.error("Разрешите всплывающие окна для печати квитанции");
                      }
                    }}
                  >
                    Распечатать квитанцию
                  </button>
                ) : null}
                <button type="button" className="bo-btn bo-btn-primary" style={{ minHeight: 44 }} onClick={onClose}>
                  Закрыть
                </button>
              </div>
            </div>
          ) : (
            <>
              {draft ? (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 14,
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid var(--bo-border)"
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(draft.total).toLocaleString("ru-RU")} руб.</div>
                  {priceDetailLine ? (
                    <div style={{ fontSize: 13, color: "var(--bo-text-muted)", marginTop: 8 }}>{priceDetailLine}</div>
                  ) : null}
                </div>
              ) : (
                <p style={{ color: "#b91c1c", marginBottom: 12 }}>Нет данных расчёта.</p>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Телефон</span>
                  <input
                    className="bo-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+373 …"
                    maxLength={14}
                    value={phone}
                    onChange={(e) => setPhone(maskPhone373(e.target.value))}
                  />
                  {phoneSearching ? <span style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Поиск…</span> : null}
                  {customerLookup && !phoneSearching ? (
                    <span style={{ fontSize: 12, color: "var(--bo-accent)", fontWeight: 500 }}>
                      Найден: {customerLookup.name}
                      {customerLookup.orderIds && customerLookup.orderIds.length > 0
                        ? ` — ${customerLookup.orderIds.length} заказов`
                        : ""}
                    </span>
                  ) : null}
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Имя *</span>
                  <input
                    className="bo-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    placeholder="ФИО или имя"
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Email</span>
                  <input className="bo-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Магазин</span>
                  <select className="bo-select" value={store} onChange={(e) => setStore(e.target.value)}>
                    <option value="">—</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Комментарий</span>
                  <textarea className="bo-input" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} style={{ resize: "vertical", minHeight: 64 }} />
                </label>

                {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" className="bo-btn bo-btn-primary" disabled={submitting || !draft} style={{ minHeight: 46, flex: "1 1 160px" }}>
                    {submitting ? "Отправка…" : "Подтвердить заказ"}
                  </button>
                  <button type="button" className="bo-btn bo-btn-secondary" onClick={onClose} style={{ minHeight: 46 }}>
                    Отмена
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
