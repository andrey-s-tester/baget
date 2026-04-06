"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BoTablePageSkeleton } from "../components/BoPageSkeleton";
import { ORDERS_LIST_VIEW_CUSTOMERS } from "../lib/bo-list-views";

const ORDERS_BY_IDS_CHUNK = 50;
const fetchOpts: RequestInit = { credentials: "include", cache: "no-store" };

async function fetchOrderConfigsByIds(ids: string[]): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < ids.length; i += ORDERS_BY_IDS_CHUNK) {
    const slice = ids.slice(i, i + ORDERS_BY_IDS_CHUNK);
    const res = await fetch(`/api/orders?ids=${slice.map(encodeURIComponent).join(",")}`, fetchOpts);
    if (!res.ok) continue;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      if (row && typeof row === "object" && "id" in row) {
        const o = row as { id: string; config?: Record<string, unknown> };
        out[o.id] = o.config ?? {};
      }
    }
  }
  return out;
}

type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  createdAt: string;
  orderIds: string[];
};

type Order = {
  id: string;
  orderNumber?: string;
  createdAt: string;
  status: string;
  customerName: string;
  total: number;
  config: Record<string, unknown>;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderConfigs, setOrderConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailFetchLoading, setDetailFetchLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [custRes, ordRes] = await Promise.all([
        fetch("/api/customers", fetchOpts),
        fetch(ORDERS_LIST_VIEW_CUSTOMERS, fetchOpts),
      ]);
      const custData = await custRes.json();
      const ordData = await ordRes.json();
      setCustomers(Array.isArray(custData) ? custData : []);
      setOrders(Array.isArray(ordData) ? ordData : []);
      setOrderConfigs({});
    } catch {
      setCustomers([]);
      setOrders([]);
      setOrderConfigs({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!expandedId) {
      setDetailFetchLoading(false);
      return;
    }
    const customer = customers.find((c) => c.id === expandedId);
    if (!customer?.orderIds.length) {
      setDetailFetchLoading(false);
      return;
    }

    const missing = customer.orderIds.filter((id) => !(id in orderConfigs));
    if (missing.length === 0) {
      setDetailFetchLoading(false);
      return;
    }

    let cancelled = false;
    setDetailFetchLoading(true);
    void (async () => {
      try {
        const merged = await fetchOrderConfigsByIds(missing);
        if (!cancelled) {
          setOrderConfigs((prev) => {
            const next = { ...prev, ...merged };
            for (const id of missing) {
              if (!(id in next)) next[id] = {};
            }
            return next;
          });
        }
      } finally {
        if (!cancelled) setDetailFetchLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expandedId, customers, orderConfigs]);

  const ordersById = new Map(orders.map((o) => [o.id, o]));

  if (loading) return <BoTablePageSkeleton titleWidth={200} />;

  return (
    <>
      <div className="bo-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="bo-page-title">Покупатели</h1>
          <p className="bo-page-subtitle">
            Список покупателей и история заказов
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="bo-btn bo-btn-ghost"
            onClick={async () => {
              try {
                const res = await fetch("/api/customers/sync", { method: "POST" });
                const data = await res.json();
                await load();
                if (data?.ok) toast.success("Синхронизация выполнена");
                else toast.error("Ошибка синхронизации");
              } catch {
                toast.error("Ошибка соединения");
              }
            }}
          >
            Синхронизировать из заказов
          </button>
          <button type="button" className="bo-btn bo-btn-secondary" onClick={() => void load()}>
            Обновить
          </button>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="bo-card bo-empty">
          <strong>Покупателей пока нет</strong>
          Новые покупатели добавляются при создании заказов.
          <br />
          <button
            type="button"
            className="bo-btn bo-btn-secondary"
            style={{ marginTop: 12 }}
            onClick={async () => {
              try {
                const res = await fetch("/api/customers/sync", { method: "POST" });
                const data = await res.json();
                await load();
                if (data?.ok) toast.success("Синхронизация выполнена");
                else toast.error("Ошибка синхронизации");
              } catch {
                toast.error("Ошибка соединения");
              }
            }}
          >
            Загрузить из существующих заказов
          </button>
        </div>
      ) : (
        <div className="bo-card">
          <table className="bo-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Email</th>
                <th style={{ textAlign: "right" }}>Заказов</th>
                <th style={{ textAlign: "right" }}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const customerOrders = c.orderIds
                  .map((id) => ordersById.get(id))
                  .filter(Boolean) as Order[];
                const totalSum = customerOrders.reduce((s, o) => s + Number(o.total), 0);
                const isExpanded = expandedId === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      key={c.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>
                          {isExpanded ? "▼" : "▶"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: "12px 16px" }}>{c.phone}</td>
                      <td style={{ padding: "12px 16px", color: "var(--bo-text-muted)" }}>
                        {c.email || "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {c.orderIds.length}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>
                        {totalSum.toLocaleString("ru-RU")} руб.
                      </td>
                    </tr>
                    {isExpanded && customerOrders.length > 0 && (
                      <tr key={`${c.id}-orders`}>
                        <td colSpan={6} style={{ padding: 0, background: "#f8fafc", borderBottom: "1px solid var(--bo-border)" }}>
                          <div style={{ padding: "16px 24px" }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 12,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: "wrap"
                              }}
                            >
                              История заказов
                              {detailFetchLoading && isExpanded && (
                                <span style={{ fontWeight: 400, color: "var(--bo-text-muted)", fontSize: 12 }}>
                                  Загрузка деталей заказов…
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {customerOrders
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map((o) => {
                                  const cfg = (orderConfigs[o.id] ?? o.config) as {
                                    widthMm?: number;
                                    heightMm?: number;
                                    selectedSku?: string;
                                  };
                                  return (
                                    <div
                                      key={o.id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "10px 14px",
                                        background: "white",
                                        borderRadius: 8,
                                        border: "1px solid var(--bo-border)",
                                        fontSize: 13,
                                      }}
                                    >
                                      <div>
                                        <span style={{ fontWeight: 600 }}>{o.orderNumber ?? o.id}</span>
                                        <span style={{ color: "var(--bo-text-muted)", marginLeft: 8 }}>
                                          {new Date(o.createdAt).toLocaleString("ru-RU")}
                                        </span>
                                        {(cfg.widthMm || cfg.heightMm) && (
                                          <span style={{ marginLeft: 8 }}>
                                            {cfg.widthMm}×{cfg.heightMm} мм
                                          </span>
                                        )}
                                        {cfg.selectedSku && (
                                          <span style={{ marginLeft: 8 }}>Арт. {cfg.selectedSku}</span>
                                        )}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>
                                        {Number(o.total).toLocaleString("ru-RU")} руб.
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && customerOrders.length === 0 && (
                      <tr key={`${c.id}-empty`}>
                        <td colSpan={6} style={{ padding: "16px 24px", background: "#f8fafc", color: "var(--bo-text-muted)", fontSize: 13 }}>
                          Нет данных о заказах
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
