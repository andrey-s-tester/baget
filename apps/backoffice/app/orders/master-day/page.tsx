"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  accessoryCatalogFromMaterialsResponse,
  enrichConfigWithAccessoryCatalog,
  isRetailShowcaseOrder,
  orderToReceiptInput,
  printMasterDayOrdersReport,
  workshopPlanRowFromConfig,
  type AccessoryCatalog,
  type OrderReceiptInput
} from "@yanak/receipt";
import { BoTablePageSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

type ApiOrder = {
  id: string;
  orderNumber?: string;
  status: string;
  total: number;
  createdAt: string;
  customerName: string;
  phone: string;
  email?: string;
  store: string;
  comment?: string;
  config: Record<string, unknown>;
};

function excludeRetailForWorkshop(list: ApiOrder[]): ApiOrder[] {
  return list.filter((o) => !isRetailShowcaseOrder({ customerName: o.customerName, config: o.config }));
}

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

function localDayBoundsISO(dateInput: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return null;
  const start = new Date(`${dateInput}T00:00:00`);
  const end = new Date(`${dateInput}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function OrdersMasterDayPage() {
  const { permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty = !permissions || Object.keys(permissions).length === 0;
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const [date, setDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [accessoryCatalog, setAccessoryCatalog] = useState<AccessoryCatalog | null>(null);

  useEffect(() => {
    fetch("/api/materials", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => setAccessoryCatalog(accessoryCatalogFromMaterialsResponse(raw)))
      .catch(() => setAccessoryCatalog(null));
  }, []);

  const dayTitle = useMemo(() => {
    const b = localDayBoundsISO(date);
    if (!b) return date;
    return new Date(b.from).toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }, [date]);

  const load = useCallback(async () => {
    const bounds = localDayBoundsISO(date);
    if (!bounds) {
      toast.error("Некорректная дата");
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams({
        from: bounds.from,
        to: bounds.to
      });
      const res = await fetch(`/api/orders?${q}`, { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!Array.isArray(data)) {
        setOrders([]);
        toast.error("Не удалось загрузить заказы");
        return;
      }
      setOrders(excludeRetailForWorkshop(data as ApiOrder[]));
    } catch {
      setOrders([]);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const handlePrint = () => {
    if (orders.length === 0) {
      toast.error("Сначала загрузите заказы или выберите день, где есть заказы");
      return;
    }
    const inputs: OrderReceiptInput[] = orders.map((o) =>
      orderToReceiptInput(
        {
          id: o.id,
          ...(o.orderNumber ? { orderNumber: o.orderNumber } : {}),
          createdAt: o.createdAt,
          status: o.status,
          customerName: o.customerName,
          phone: o.phone,
          email: o.email,
          store: o.store,
          comment: o.comment,
          total: o.total,
          config: o.config
        },
        STATUS_LABELS[o.status] ?? o.status,
        accessoryCatalog ? { accessoryCatalog } : undefined
      )
    );
    const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU");
    if (
      !printMasterDayOrdersReport({
        dayTitle,
        dateLabel,
        orders: inputs,
        hidePrices: true
      })
    ) {
      toast.error("Разрешите всплывающие окна для печати");
    }
  };

  if (permLoading) return <BoTablePageSkeleton titleWidth={280} />;

  if (!can("orders")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p className="bo-muted" style={{ marginTop: 8 }}>
          Нужны права на раздел «Заказы».
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: "calc(100dvh - 96px)",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div className="bo-page-header" style={{ marginBottom: 0, flexShrink: 0 }}>
        <h1 className="bo-page-title">Смена мастера</h1>
        <p className="bo-page-subtitle">
          Один заказ — одна строка. Заказы «Розница» и продажи только с витрины в список не попадают.
        </p>
      </div>

      <div
        className="bo-card bo-card-body"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: "none",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 20, flexShrink: 0 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
            <span>Дата</span>
            <input
              type="date"
              className="bo-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </label>
          <button type="button" className="bo-btn bo-btn-secondary" disabled={loading} onClick={() => void load()}>
            {loading ? "Загрузка…" : "Показать заказы"}
          </button>
          <button
            type="button"
            className="bo-btn bo-btn-primary"
            disabled={loading || orders.length === 0}
            onClick={handlePrint}
          >
            Распечатать план в цех
          </button>
        </div>

        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--bo-text-muted)", flexShrink: 0 }}>
          <strong>{dayTitle}</strong>
          {orders.length > 0 ? (
            <>
              {" "}
              · заказов: {orders.length}
            </>
          ) : (
            <> · нажмите «Показать заказы»</>
          )}
        </p>

        {orders.length > 0 ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              border: "1px solid var(--bo-border)",
              borderRadius: 10,
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table className="bo-table" style={{ margin: 0, width: "100%", minWidth: 1320 }}>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>№</th>
                  <th>Кол-во</th>
                  <th>Тип работы</th>
                  <th>Размер (мм)</th>
                  <th>Снаружи (мм)</th>
                  <th>Багет</th>
                  <th>Паспарту</th>
                  <th>Стекло</th>
                  <th>Задник</th>
                  <th>Подрамник</th>
                  <th>Дополнительно</th>
                  <th>Клиент</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const cfg = accessoryCatalog
                    ? enrichConfigWithAccessoryCatalog(o.config, accessoryCatalog)
                    : o.config;
                  const plan = workshopPlanRowFromConfig(cfg);
                  const num = o.orderNumber ?? o.id.slice(0, 10);
                  return (
                    <tr key={o.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                        {new Date(o.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ fontWeight: 600 }}>#{num}</td>
                      <td style={{ textAlign: "center", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {plan.quantity}
                      </td>
                      <td>{plan.workType}</td>
                      <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{plan.openingSizeMm}</td>
                      <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                        {plan.outerSizeMm}
                      </td>
                      <td style={{ fontSize: 12 }}>{plan.frameSku}</td>
                      <td style={{ fontSize: 11, maxWidth: 200, lineHeight: 1.35 }}>{plan.matboard}</td>
                      <td style={{ fontSize: 12 }}>{plan.glass}</td>
                      <td style={{ fontSize: 12 }}>{plan.backing}</td>
                      <td style={{ fontSize: 11, maxWidth: 160, lineHeight: 1.35 }}>{plan.subframe}</td>
                      <td style={{ fontSize: 11, maxWidth: 200, lineHeight: 1.35 }}>{plan.extras}</td>
                      <td>{o.customerName}</td>
                      <td style={{ fontSize: 12, color: "var(--bo-text-muted)", maxWidth: 160 }}>
                        {o.comment?.trim() || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <p className="bo-muted" style={{ margin: 0 }}>
            Нет данных за этот день или список ещё не загружен.
          </p>
        ) : null}
      </div>
    </div>
  );
}
