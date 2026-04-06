"use client";

import { useEffect, useMemo, useState } from "react";
import { BoTablePageSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

type Movement = {
  id: string;
  kind: string;
  sku: string;
  delta: number;
  unit: string;
  reason: string;
  note: string | null;
  createdAt: string;
};

const REASON_LABELS: Record<string, string> = {
  purchase: "Поступление",
  adjustment: "Корректировка",
  manual: "Вручную",
  order: "Заказ"
};

export default function ReportsMovementsPage() {
  const { permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<"all" | "frame" | "matboard">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [fr, mb] = await Promise.all([
          fetch("/api/catalog/stock/movements?kind=frame&limit=100", {
            credentials: "include",
            cache: "no-store"
          }).then((r) => (r.ok ? r.json() : [])),
          fetch("/api/catalog/stock/movements?kind=matboard&limit=100", {
            credentials: "include",
            cache: "no-store"
          }).then((r) => (r.ok ? r.json() : []))
        ]);
        const a = Array.isArray(fr) ? fr : [];
        const b = Array.isArray(mb) ? mb : [];
        const merged = [...a, ...b].sort(
          (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
        );
        if (!cancelled) setRows(merged);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return rows;
    return rows.filter((m) => m.kind === kindFilter);
  }, [rows, kindFilter]);

  if (loading) return <BoTablePageSkeleton titleWidth={240} />;

  if (!can("reports_movements")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Движения склада» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Движения склада</h1>
          <p className="bo-page-subtitle">
            Последние движения по багету (м) и паспарту (м²): поступления, списания по заказам, корректировки.
          </p>
        </div>
      </div>

      <div className="bo-card" style={{ marginBottom: 16, padding: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, maxWidth: 240 }}>
          <span>Тип номенклатуры</span>
          <select
            className="bo-select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "all" | "frame" | "matboard")}
          >
            <option value="all">Все</option>
            <option value="frame">Багет</option>
            <option value="matboard">Паспарту</option>
          </select>
        </label>
      </div>

      <div className="bo-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--bo-border)", fontWeight: 600 }}>
          Журнал (до 300 записей)
        </div>
        {filtered.length === 0 ? (
          <div className="bo-empty" style={{ padding: 24 }}>
            Нет движений.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="bo-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Вид</th>
                  <th>Артикул</th>
                  <th style={{ textAlign: "right" }}>Изменение</th>
                  <th>Причина</th>
                  <th>Примечание</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.createdAt).toLocaleString("ru-RU")}</td>
                    <td>{m.kind === "frame" ? "Багет" : "Паспарту"}</td>
                    <td>
                      <strong>{m.sku}</strong>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: m.delta < 0 ? "#b91c1c" : "#15803d"
                      }}
                    >
                      {m.delta > 0 ? "+" : ""}
                      {m.delta} {m.unit}
                    </td>
                    <td>{REASON_LABELS[m.reason] ?? m.reason}</td>
                    <td style={{ maxWidth: 280, fontSize: 12, color: "var(--bo-text-muted)" }}>
                      {m.note || "—"}
                    </td>
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
