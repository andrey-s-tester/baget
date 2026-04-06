"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@yanak/ui";
import { printOrderReceipt } from "@yanak/receipt";

type OrderDraft = {
  total: number;
  config: Record<string, unknown>;
  priceDetailLine?: string;
};

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

function parseTotal(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function OrderPage() {
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    store: "",
    comment: ""
  });
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [customerLookup, setCustomerLookup] = useState<CustomerLookup | null>(null);
  const [phoneSearching, setPhoneSearching] = useState(false);
  /** Публичный номер (1, 2, 3…) для экрана успеха */
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  /** Внутренний id заказа для квитанции */
  const [createdOrderInternalId, setCreatedOrderInternalId] = useState<string | null>(null);
  const [printBlockedHint, setPrintBlockedHint] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("order-draft");
      if (!raw) {
        window.location.href = "/";
        return;
      }
      const data = JSON.parse(raw) as OrderDraft;
      const total = parseTotal((data as { total?: unknown })?.total);
      if (total == null || !data.config) {
        window.location.href = "/";
        return;
      }
      setDraft({
        total,
        config: data.config,
        priceDetailLine: typeof (data as { priceDetailLine?: unknown }).priceDetailLine === "string"
          ? (data as { priceDetailLine: string }).priceDetailLine
          : undefined
      });
    } catch {
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/stores", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: StoreItem[]) => {
        const active = Array.isArray(list) ? list.filter((s) => s.isActive !== false) : [];
        setStores(active);
        setCustomer((c) => ({ ...c, store: c.store || (active[0] as StoreItem | undefined)?.name || "" }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const digits = digitsOnly(customer.phone);
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

    const t = window.setTimeout(async () => {
      setPhoneSearching(true);
      try {
        const res = await fetch(`/api/customers/by-phone?phone=${encodeURIComponent(queryPhone)}`, {
          cache: "no-store"
        });
        const data = (await res.json()) as unknown;
        if (
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          data !== null &&
          "name" in data &&
          typeof (data as { name?: unknown }).name === "string"
        ) {
          const row = data as CustomerLookup & { orderIds?: string[] };
          setCustomerLookup({
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            orderIds: row.orderIds ?? []
          });
          setCustomer((c) => ({
            ...c,
            name: row.name,
            email: row.email ?? c.email
          }));
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
  }, [customer.phone]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          customerName: customer.name,
          phone: customer.phone,
          email: customer.email,
          store: customer.store,
          comment: customer.comment,
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
        const internalId =
          typeof data.orderId === "string" && data.orderId.trim()
            ? data.orderId.trim()
            : typeof data.id === "string" && data.id.trim()
              ? data.id.trim()
              : "";
        const pub =
          typeof data.orderNumber === "string" && data.orderNumber.trim() ? data.orderNumber.trim() : "";
        setCreatedOrderNumber(pub || null);
        setCreatedOrderInternalId(internalId || null);
        if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: "YANAK_ORDER_CREATED",
              orderId: internalId,
              orderNumber: typeof data.orderNumber === "string" ? data.orderNumber : undefined,
              total: draft.total
            },
            "*"
          );
        }
        sessionStorage.removeItem("order-draft");
        setSuccess(true);
      } else {
        const msg =
          typeof data.message === "string"
            ? data.message
            : Array.isArray(data.message)
              ? data.message.join(" ")
              : "Не удалось оформить заказ. Попробуйте ещё раз.";
        setError(msg);
      }
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="app-main">
        <p className="hint">Загрузка…</p>
      </main>
    );
  }

  if (!draft) {
    return null;
  }

  if (success) {
    return (
      <main className="app-main">
        <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
          <Card className="card-inner">
            <div style={{ padding: "32px 24px" }}>
            <h1 className="app-title" style={{ marginBottom: 12 }}>
              Заказ принят
            </h1>
            <p style={{ margin: 0, fontSize: 1.05, color: "var(--muted)", lineHeight: 1.5 }}>
              С вами свяжутся в ближайшее время.
            </p>
            {createdOrderNumber ? (
              <p className="hint" style={{ margin: "12px 0 0" }}>
                Номер заказа: <strong>{createdOrderNumber}</strong>
              </p>
            ) : null}
            {draft && createdOrderInternalId ? (
              <>
                <button
                  type="button"
                  className="btn btn-muted"
                  style={{ marginTop: 20, display: "inline-block" }}
                  onClick={() => {
                    setPrintBlockedHint("");
                    const ok = printOrderReceipt({
                      orderId: createdOrderInternalId,
                      ...(createdOrderNumber && createdOrderNumber !== createdOrderInternalId
                        ? { orderNumber: createdOrderNumber }
                        : {}),
                      createdAtIso: new Date().toISOString(),
                      customerName: customer.name,
                      phone: customer.phone,
                      email: customer.email || undefined,
                      store: customer.store || undefined,
                      comment: customer.comment || undefined,
                      total: draft.total,
                      statusLabel: "Новый",
                      priceDetailLine: draft.priceDetailLine,
                      config: draft.config
                    });
                    if (!ok) setPrintBlockedHint("Разрешите всплывающие окна для печати квитанции.");
                  }}
                >
                  Распечатать квитанцию
                </button>
                {printBlockedHint ? (
                  <p className="error-text" style={{ marginTop: 10, fontSize: 14 }}>
                    {printBlockedHint}
                  </p>
                ) : null}
              </>
            ) : null}
            <Link href="/" className="btn btn-accent" style={{ marginTop: 24, display: "inline-block", textDecoration: "none" }}>
              В конструктор
            </Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="app-main">
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 className="app-title">Оформление заказа</h1>
        <p className="app-subtitle">Заполните контактные данные</p>

        <Card className="card-inner">
          <div className="price-box" style={{ marginBottom: 20 }}>
            <div className="price-total">{Math.round(draft.total).toLocaleString("ru-RU")} руб.</div>
            {typeof (draft.config as { widthMm?: unknown }).widthMm === "number" &&
            (draft.config as { widthMm?: number }).widthMm! > 0 ? (
              <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.45 }}>
                Количество рамок:{" "}
                <strong>
                  {Math.max(
                    1,
                    Math.min(
                      500,
                      Math.floor(
                        Number((draft.config as { quantity?: unknown }).quantity) || 1
                      )
                    )
                  )}{" "}
                  шт.
                </strong>
              </p>
            ) : null}
            {draft.priceDetailLine ? (
              <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.45 }}>
                {draft.priceDetailLine}
              </p>
            ) : null}
          </div>

          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="phone">
                Телефон
              </label>
              <input
                id="phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+373 …"
                maxLength={14}
                value={customer.phone}
                onChange={(e) => setCustomer((p) => ({ ...p, phone: maskPhone373(e.target.value) }))}
                required
              />
              {phoneSearching ? <p className="hint" style={{ margin: "6px 0 0" }}>Поиск покупателя…</p> : null}
              {customerLookup && !phoneSearching ? (
                <p className="hint" style={{ margin: "6px 0 0", color: "#2563eb", fontWeight: 500 }}>
                  Найден: {customerLookup.name}
                  {customerLookup.orderIds?.length ? ` — ${customerLookup.orderIds.length} заказов` : ""}
                </p>
              ) : null}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="name">
                Имя
              </label>
              <input
                id="name"
                className="input"
                value={customer.name}
                onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email (необязательно)
              </label>
              <input
                id="email"
                className="input"
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="store">
                Салон
              </label>
              <select
                id="store"
                className="select"
                value={customer.store}
                onChange={(e) => setCustomer((p) => ({ ...p, store: e.target.value }))}
              >
                {stores.length === 0 ? (
                  <option value="">—</option>
                ) : (
                  stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comment">
                Комментарий
              </label>
              <textarea
                id="comment"
                className="textarea"
                value={customer.comment}
                onChange={(e) => setCustomer((p) => ({ ...p, comment: e.target.value }))}
              />
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <button type="submit" className="btn btn-accent" disabled={submitting} style={{ minHeight: 46 }}>
              {submitting ? "Отправка…" : "Подтвердить заказ"}
            </button>
          </form>
        </Card>

        <Link href="/" className="btn btn-muted" style={{ marginTop: 16, display: "inline-block", textDecoration: "none" }}>
          ← Назад в конструктор
        </Link>
      </div>
    </main>
  );
}
