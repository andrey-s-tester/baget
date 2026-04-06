"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BoTablePageSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

type ReceiptRow = {
  id: string;
  docNumber: string;
  status: "draft" | "posted";
  comment: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: { kind: string; sku: string; quantity: number; lineNo: number }[];
};

export default function ReportsReceiptsPage() {
  const { permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyPosted, setOnlyPosted] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/catalog/stock/receipts?limit=120", {
          credentials: "include",
          cache: "no-store"
        });
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
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
    if (!onlyPosted) return rows;
    return rows.filter((r) => r.status === "posted");
  }, [rows, onlyPosted]);

  const totalsPosted = useMemo(() => {
    let frameM = 0;
    let matM2 = 0;
    for (const r of filtered) {
      if (r.status !== "posted") continue;
      for (const l of r.lines || []) {
        if (l.kind === "frame") frameM += Number(l.quantity) || 0;
        if (l.kind === "matboard") matM2 += Number(l.quantity) || 0;
      }
    }
    return { frameM, matM2 };
  }, [filtered]);

  const postedDocsInView = useMemo(
    () => filtered.filter((r) => r.status === "posted").length,
    [filtered]
  );

  if (loading) return <BoTablePageSkeleton titleWidth={260} />;

  if (!can("reports_receipts")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Поступления на склад» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Поступления на склад</h1>
          <p className="bo-page-subtitle">
            Документы поступления (проведённые). Создание и проведение — в разделе{" "}
            <Link href="/warehouse" style={{ color: "var(--bo-accent)" }}>
              Склад
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="bo-card" style={{ marginBottom: 16, padding: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={onlyPosted}
            onChange={(e) => setOnlyPosted(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Только проведённые документы
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 16,
            marginTop: 16
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Документов (в списке)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{filtered.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Проведённых в списке</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{postedDocsInView}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Багет по проведённым, м</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{totalsPosted.frameM.toFixed(3)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Паспарту по проведённым, м²</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{totalsPosted.matM2.toFixed(4)}</div>
          </div>
        </div>
      </div>

      <div className="bo-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--bo-border)", fontWeight: 600 }}>
          Документы
        </div>
        {filtered.length === 0 ? (
          <div className="bo-empty" style={{ padding: 24 }}>
            Нет документов.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="bo-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Статус</th>
                  <th>Создан</th>
                  <th>Проведён</th>
                  <th>Строк</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href="/warehouse" style={{ color: "var(--bo-accent)", fontWeight: 600 }}>
                        {r.docNumber}
                      </Link>
                    </td>
                    <td>{r.status === "posted" ? "Проведён" : "Черновик"}</td>
                    <td>{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                    <td>
                      {r.postedAt ? new Date(r.postedAt).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td>{r.lines?.length ?? 0}</td>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.comment || "—"}
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
