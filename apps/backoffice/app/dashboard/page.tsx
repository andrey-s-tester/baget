import { headers } from "next/headers";
import {
  businessTimeZone,
  calendarDateKeyInBusinessZone,
  todayCalendarKeyInBusinessZone
} from "../lib/business-date";
import { ORDERS_LIST_VIEW } from "../lib/bo-list-views";
import { getServerApiBase } from "../lib/server-api";

type Order = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  store: string;
};

type Store = {
  id: string;
  name: string;
  isActive: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  assigned: "Назначен",
  in_progress: "В работе",
  assembly: "Сборка",
  waiting_materials: "Ожидание материалов",
  ready: "Готов",
  issued: "Выдан",
  cancelled: "Отменён",
};

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchDashboardFromApi(cookieHeader: string): Promise<{ orders: Order[]; stores: Store[] }> {
  const apiBase = getServerApiBase();
  const init: RequestInit = {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  };
  try {
    const [ordRes, storeRes] = await Promise.all([
      fetch(`${apiBase}${ORDERS_LIST_VIEW}`, init),
      fetch(`${apiBase}/api/stores`, init)
    ]);
    const ordData = ordRes.ok ? await ordRes.json() : [];
    const storeData = storeRes.ok ? await storeRes.json() : [];
    return {
      orders: Array.isArray(ordData) ? ordData : [],
      stores: Array.isArray(storeData) ? storeData : []
    };
  } catch {
    return { orders: [], stores: [] };
  }
}

export default async function DashboardPage() {
  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";

  /** Без unstable_cache: в dev (Turbopack) и части Docker-сборок он давал 500 «Internal Server Error». */
  const { orders, stores } = await fetchDashboardFromApi(cookieHeader);

  const tz = businessTimeZone();
  const dayKey = todayCalendarKeyInBusinessZone(tz);
  const ordersToday = orders.filter((o) => calendarDateKeyInBusinessZone(o.createdAt, tz) === dayKey);

  const totalRevenue = ordersToday.reduce((s, o) => s + Number(o.total || 0), 0);
  const activeOrders = ordersToday.filter((o) => !["issued", "cancelled"].includes(o.status));
  const avgCheck = ordersToday.length > 0 ? Math.round(totalRevenue / ordersToday.length) : 0;

  const byStatus = ordersToday.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const byStore = ordersToday.reduce<Record<string, { count: number; sum: number }>>((acc, o) => {
    const key = o.store || "Без магазина";
    if (!acc[key]) acc[key] = { count: 0, sum: 0 };
    acc[key].count += 1;
    acc[key].sum += Number(o.total || 0);
    return acc;
  }, {});

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz
  });

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Дашборд</h1>
        <p className="bo-page-subtitle">
          Показатели за сегодня: <strong style={{ color: "var(--bo-text)" }}>{todayLabel}</strong>
          . Сутки с <strong>00:00</strong> по часовому поясу <code style={{ fontSize: 12 }}>{tz}</code> (переменные{" "}
          <code style={{ fontSize: 12 }}>BUSINESS_TIMEZONE</code> /{" "}
          <code style={{ fontSize: 12 }}>NEXT_PUBLIC_BUSINESS_TIMEZONE</code>
          ). Сводки по статусам и магазинам — за эти сутки. Список магазинов ниже — справочник.
        </p>
      </div>

      <div className="bo-stats-grid" style={{ marginBottom: 28 }}>
        <div className="bo-stat-card">
          <div className="bo-stat-label">Заказов сегодня</div>
          <div className="bo-stat-value">{ordersToday.length}</div>
        </div>
        <div className="bo-stat-card">
          <div className="bo-stat-label">Выручка за сегодня</div>
          <div className="bo-stat-value">{totalRevenue.toLocaleString("ru-RU")} руб.</div>
        </div>
        <div className="bo-stat-card">
          <div className="bo-stat-label">Средний чек (сегодня)</div>
          <div className="bo-stat-value">{avgCheck.toLocaleString("ru-RU")} руб.</div>
        </div>
        <div className="bo-stat-card">
          <div className="bo-stat-label">Активных сегодня</div>
          <div className="bo-stat-value">{activeOrders.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        <div className="bo-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>По статусам (сегодня)</h3>
          {Object.keys(byStatus).length === 0 ? (
            <p style={{ margin: 0, color: "var(--bo-text-muted)", fontSize: 14 }}>Нет данных</p>
          ) : (
            <table className="bo-table">
              <tbody>
                {Object.entries(byStatus).map(([status, count]) => (
                  <tr key={status}>
                    <td>{STATUS_LABELS[status] ?? status}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bo-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>По магазинам (сегодня)</h3>
          {Object.keys(byStore).length === 0 ? (
            <p style={{ margin: 0, color: "var(--bo-text-muted)", fontSize: 14 }}>Нет данных</p>
          ) : (
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Магазин</th>
                  <th style={{ textAlign: "right" }}>Заказов</th>
                  <th style={{ textAlign: "right" }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byStore).map(([store, { count, sum }]) => (
                  <tr key={store}>
                    <td>{store}</td>
                    <td style={{ textAlign: "right" }}>{count}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {sum.toLocaleString("ru-RU")} руб.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Магазины ({stores.length})</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {stores.map((s) => (
            <span
              key={s.id}
              className="bo-badge"
              style={{
                background: s.isActive ? "#dcfce7" : "#f1f5f9",
                color: s.isActive ? "#166534" : "#64748b"
              }}
            >
              {s.name}
            </span>
          ))}
          {stores.length === 0 && (
            <span style={{ color: "var(--bo-text-muted)", fontSize: 14 }}>Нет магазинов</span>
          )}
        </div>
      </div>
    </>
  );
}
