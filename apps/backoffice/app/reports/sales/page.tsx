"use client";

import { useEffect, useMemo, useState } from "react";
import { BoTablePageSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";
import {
  businessTimeZone,
  calendarDateKeyInBusinessZone,
  calendarMonthKeyInBusinessZone
} from "../../lib/business-date";
import { ORDERS_LIST_VIEW } from "../../lib/bo-list-views";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  customerName: string;
  phone: string;
  store: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  assigned: "Назначен",
  in_progress: "В работе",
  assembly: "Сборка",
  waiting_materials: "Ожидание материалов",
  ready: "Готов",
  issued: "Выдан",
  cancelled: "Отменён"
};

type PeriodMode = "all" | "month" | "calendar";
type CalendarSubmode = "day" | "range";

const periodBtn = (active: boolean) =>
  ({
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: `1px solid ${active ? "var(--bo-accent)" : "var(--bo-border)"}`,
    background: active ? "rgba(20, 184, 166, 0.12)" : "var(--bo-surface)",
    color: active ? "var(--bo-accent)" : "var(--bo-text-muted)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s, border-color 0.15s"
  }) as const;

export default function ReportsSalesPage() {
  const { permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [calendarSubmode, setCalendarSubmode] = useState<CalendarSubmode>("day");
  const [dayPicker, setDayPicker] = useState<string>("");
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(ORDERS_LIST_VIEW, { credentials: "include", cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setOrders(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tz = businessTimeZone();

  const filtered = useMemo(() => {
    let list: OrderRow[];

    if (periodMode === "month") {
      list = monthFilter
        ? orders.filter((o) => calendarMonthKeyInBusinessZone(o.createdAt, tz) === monthFilter)
        : orders;
    } else if (periodMode === "calendar") {
      if (calendarSubmode === "day") {
        if (!dayPicker) {
          list = orders;
        } else {
          list = orders.filter((o) => calendarDateKeyInBusinessZone(o.createdAt, tz) === dayPicker);
        }
      } else {
        if (!rangeFrom || !rangeTo) {
          list = orders;
        } else {
          const a = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
          const b = rangeFrom <= rangeTo ? rangeTo : rangeFrom;
          list = orders.filter((o) => {
            const k = calendarDateKeyInBusinessZone(o.createdAt, tz);
            return k >= a && k <= b;
          });
        }
      }
    } else {
      list = orders;
    }

    return [...list].sort(
      (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
    );
  }, [orders, periodMode, monthFilter, calendarSubmode, dayPicker, rangeFrom, rangeTo, tz]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) set.add(calendarMonthKeyInBusinessZone(o.createdAt, tz));
    return [...set].sort().reverse();
  }, [orders, tz]);

  const totalSum = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
  const cancelledSum = filtered
    .filter((o) => o.status === "cancelled")
    .reduce((s, o) => s + Number(o.total || 0), 0);

  if (loading) return <BoTablePageSkeleton titleWidth={220} />;

  if (!can("reports_sales")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Отчёт по продажам» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Отчёт по продажам</h1>
          <p className="bo-page-subtitle">
            Заказы из конструктора и бэкофиса: суммы и статусы.             Учёт по дате создания заказа; календарный день и месяц — в поясе{" "}
            <code style={{ fontSize: 12 }}>{tz}</code> (сутки с 00:00). Можно выбрать месяц, один день или период.
          </p>
        </div>
      </div>

      <div className="bo-card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bo-text-muted)", marginBottom: 8 }}>
            Период
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              style={periodBtn(periodMode === "all")}
              onClick={() => {
                setPeriodMode("all");
                setMonthFilter("");
                setDayPicker("");
                setRangeFrom("");
                setRangeTo("");
              }}
            >
              Все даты
            </button>
            <button
              type="button"
              style={periodBtn(periodMode === "month")}
              onClick={() => {
                setPeriodMode("month");
                setDayPicker("");
                setRangeFrom("");
                setRangeTo("");
              }}
            >
              По месяцу
            </button>
            <button
              type="button"
              style={periodBtn(periodMode === "calendar")}
              onClick={() => {
                setPeriodMode("calendar");
                setMonthFilter("");
              }}
            >
              По календарю
            </button>
          </div>
        </div>

        {periodMode === "month" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, maxWidth: 280 }}>
            <span>Месяц</span>
            <select
              className="bo-select"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">Все месяцы из данных</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {periodMode === "calendar" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--bo-text-muted)" }}>Тип:</span>
              <button
                type="button"
                style={periodBtn(calendarSubmode === "day")}
                onClick={() => setCalendarSubmode("day")}
              >
                Один день
              </button>
              <button
                type="button"
                style={periodBtn(calendarSubmode === "range")}
                onClick={() => setCalendarSubmode("range")}
              >
                Период (несколько дней)
              </button>
            </div>

            {calendarSubmode === "day" ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, maxWidth: 280 }}>
                <span>Дата</span>
                <input
                  type="date"
                  className="bo-input"
                  value={dayPicker}
                  onChange={(e) => setDayPicker(e.target.value)}
                />
              </label>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                  <span>С даты</span>
                  <input
                    type="date"
                    className="bo-input"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                  <span>По дату</span>
                  <input
                    type="date"
                    className="bo-input"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                  />
                </label>
              </div>
            )}

            {calendarSubmode === "day" && !dayPicker ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--bo-text-muted)", maxWidth: 520 }}>
                Выберите день — пока показаны все заказы. После выбора останутся заказы за эту календарную дату в поясе{" "}
                {tz}.
              </p>
            ) : null}
            {calendarSubmode === "range" && (!rangeFrom || !rangeTo) ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--bo-text-muted)", maxWidth: 520 }}>
                Укажите обе границы периода. Пока не заполнено — показаны все заказы. Даты включаются в отчёт.
              </p>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, marginTop: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Заказов</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{filtered.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Сумма (выбранный период)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{totalSum.toLocaleString("ru-RU")} ₽</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>В т.ч. отменённые (сумма)</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#94a3b8" }}>{cancelledSum.toLocaleString("ru-RU")} ₽</div>
          </div>
        </div>
      </div>

      <div className="bo-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--bo-border)", fontWeight: 600 }}>
          Детализация
        </div>
        {filtered.length === 0 ? (
          <div className="bo-empty" style={{ padding: 24 }}>Нет заказов за выбранные условия.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="bo-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Дата</th><th>Клиент</th><th>Телефон</th><th>Магазин</th><th>Статус</th><th style={{ textAlign: "right" }}>Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.createdAt).toLocaleString("ru-RU")}</td>
                    <td>{o.customerName}</td>
                    <td>{o.phone || "—"}</td>
                    <td>{o.store || "—"}</td>
                    <td>{STATUS_LABELS[o.status] ?? o.status}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(o.total).toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
