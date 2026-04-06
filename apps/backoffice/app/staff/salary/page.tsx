"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BoInlineTableSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

type PeriodSummary = {
  id: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  comment: string | null;
  sellersCount: number;
  mastersCount?: number;
  totalAmount: number;
  myAmount: number;
  updatedAt?: string;
};

type SellerCalcRow = {
  userId: string;
  email: string;
  name: string | null;
  storeId: string | null;
  storeName: string | null;
  baseAmount: number;
  percent: number;
  salesTotal: number;
  salaryTotal: number;
  issuedAmount?: number | null;
};

type MasterAssemblyBreakdownRow = {
  code: string;
  poolRub: number;
  variablePayRub: number;
  variableInSalaryRub: number;
  /** false — услуга снята в алгоритме мастера, в пул по ней не идёт */
  enabledInAlgorithm?: boolean;
};

type MasterCalcRow = {
  userId: string;
  email: string;
  name: string | null;
  storeId: string | null;
  storeName: string | null;
  accountRole?: string;
  baseAmount: number;
  masterSharePercent: number;
  complexityMultiplier: number;
  assemblyTotal: number;
  salaryTotal: number;
  issuedAmount?: number | null;
  doesFrameAssembly?: boolean;
  doesCanvasStretch?: boolean;
  doesGlass?: boolean;
  doesBacking?: boolean;
  doesMatCut?: boolean;
  /** Разбивка пула и начисления по услугам (как в алгоритме расчёта) */
  assemblyBreakdown?: MasterAssemblyBreakdownRow[];
};

type PeriodDetail = {
  id: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  comment: string | null;
  updatedAt: string;
  sellers: SellerCalcRow[];
  masters: MasterCalcRow[];
  mySalary: number;
  myIssued?: boolean;
};

type PayoutLine = {
  id: string;
  amount: number;
  note: string | null;
  createdAt: string;
  period: { id: string; label: string; dateFrom: string; dateTo: string };
  user: { id: string; email: string; name: string | null };
};

type PayoutSummary =
  | {
      ok: true;
      scope: "all";
      totalPaid: number;
      payoutCount: number;
      employeesWithPayouts: number;
    }
  | {
      ok: true;
      scope: "me";
      totalPaid: number;
      payoutCount: number;
    };

type AccessUserLite = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const MASTER_ASSEMBLY_OP_LABELS: Record<string, string> = {
  frameAssembly: "Сборка рамы",
  canvasStretch: "Натяжка холста",
  glass: "Стекло (резка и установка)",
  backing: "Задник (резка и установка)",
  matCut: "Паспарту"
};

/** Показывать кнопку разбивки: всегда, если API прислал строки; иначе — при ненулевом пуле/переменной части */
function masterAssemblyExpandable(m: MasterCalcRow): boolean {
  const rows = m.assemblyBreakdown;
  if (Array.isArray(rows) && rows.length > 0) return true;
  const variableApprox = m.salaryTotal - m.baseAmount;
  return m.assemblyTotal > 0.005 || variableApprox > 0.005;
}

function masterEnabledOpsFromAlgorithm(m: MasterCalcRow): string[] {
  const out: string[] = [];
  if (m.doesFrameAssembly !== false) out.push("Сборка рамы");
  if (m.doesCanvasStretch !== false) out.push("Натяжка холста");
  if (m.doesGlass !== false) out.push("Стекло");
  if (m.doesBacking !== false) out.push("Задник");
  if (m.doesMatCut !== false) out.push("Паспарту");
  return out;
}

function isManageRole(role: string | undefined) {
  return role === "owner" || role === "admin" || role === "manager";
}

function canDeletePayrollPeriod(role: string | undefined) {
  return role === "owner" || role === "admin";
}

type MainTab = "ledger" | "payouts";

export default function SalaryPayrollPage() {
  const { user, permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty = !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const manage = isManageRole(user?.role);
  const canListStaff = manage || failOpen || Boolean(permissions?.staff_employees);
  const fetchOpts = useMemo<RequestInit>(() => ({ credentials: "include", cache: "no-store" }), []);

  const [mainTab, setMainTab] = useState<MainTab>("ledger");
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issueLoading, setIssueLoading] = useState(false);
  const [deletePeriodLoading, setDeletePeriodLoading] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ label: "", dateFrom: "", dateTo: "", comment: "" });

  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [payoutLines, setPayoutLines] = useState<PayoutLine[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [historyUserId, setHistoryUserId] = useState<string>("");
  const [staffUsers, setStaffUsers] = useState<AccessUserLite[]>([]);
  const [assemblyDetailOpen, setAssemblyDetailOpen] = useState<Record<string, boolean>>({});

  const allIssuedForPeriod =
    !!detail &&
    (detail.sellers.length === 0 || detail.sellers.every((s) => s.issuedAmount != null)) &&
    (!detail.masters || detail.masters.length === 0 || detail.masters.every((m) => m.issuedAmount != null));

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/periods", fetchOpts);
      const data = (await res.json()) as { ok?: boolean; periods?: PeriodSummary[] };
      setPeriods(data.ok && Array.isArray(data.periods) ? data.periods : []);
    } catch {
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [fetchOpts]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/payroll/periods/${encodeURIComponent(id)}`, fetchOpts);
      const data = (await res.json()) as { ok?: boolean; period?: PeriodDetail };
      if (data.ok && data.period) {
        const p = data.period;
        setDetail({
          ...p,
          sellers: (p.sellers ?? []).map((s) => ({ ...s, issuedAmount: s.issuedAmount ?? null })),
          masters: (p.masters ?? []).map((m) => ({
            ...m,
            issuedAmount: m.issuedAmount ?? null,
            assemblyBreakdown: Array.isArray(m.assemblyBreakdown)
              ? m.assemblyBreakdown.map((row) => ({
                  code: String((row as MasterAssemblyBreakdownRow).code ?? ""),
                  poolRub: Number((row as MasterAssemblyBreakdownRow).poolRub) || 0,
                  variablePayRub: Number((row as MasterAssemblyBreakdownRow).variablePayRub) || 0,
                  variableInSalaryRub: Number((row as MasterAssemblyBreakdownRow).variableInSalaryRub) || 0,
                  enabledInAlgorithm: (row as MasterAssemblyBreakdownRow).enabledInAlgorithm !== false
                }))
              : m.assemblyBreakdown
          })),
          myIssued: Boolean((p as { myIssued?: boolean }).myIssued)
        });
      } else setDetail(null);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [fetchOpts]);

  const loadPayouts = useCallback(async () => {
    setPayoutLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        fetch("/api/payroll/payout-summary", fetchOpts),
        fetch(
          `/api/payroll/payout-history?limit=250${historyUserId.trim() ? `&userId=${encodeURIComponent(historyUserId.trim())}` : ""}`,
          fetchOpts
        )
      ]);
      const sJson = (await sRes.json()) as PayoutSummary & { ok?: boolean };
      const hJson = (await hRes.json()) as { ok?: boolean; lines?: PayoutLine[] };
      setPayoutSummary(sJson.ok === true && "scope" in sJson ? sJson : null);
      setPayoutLines(hJson.ok && Array.isArray(hJson.lines) ? hJson.lines : []);
    } catch {
      setPayoutSummary(null);
      setPayoutLines([]);
    } finally {
      setPayoutLoading(false);
    }
  }, [fetchOpts, historyUserId]);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    if (!selectedId) setDetail(null);
    else void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    setAssemblyDetailOpen({});
  }, [selectedId]);

  useEffect(() => {
    if (mainTab !== "payouts") return;
    void loadPayouts();
  }, [mainTab, loadPayouts]);

  useEffect(() => {
    if (mainTab !== "payouts" || !manage || !canListStaff) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/users", fetchOpts);
        const data = (await res.json()) as { users?: AccessUserLite[] };
        if (!cancelled && Array.isArray(data.users)) {
          setStaffUsers(
            data.users
              .filter((u) => ["seller", "master", "worker", "manager", "dealer"].includes(u.role))
              .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "ru"))
          );
        }
      } catch {
        if (!cancelled) setStaffUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainTab, manage, canListStaff, fetchOpts]);

  async function deleteSelectedPeriod() {
    if (!selectedId || !detail) return;
    if (
      !confirm(`Удалить отчёт «${detail.label}» (${detail.dateFrom} — ${detail.dateTo})? Действие необратимо.`)
    ) {
      return;
    }
    setDeletePeriodLoading(true);
    try {
      const res = await fetch(`/api/payroll/periods/${encodeURIComponent(selectedId)}`, {
        ...fetchOpts,
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && typeof data === "object" && (data as { ok?: boolean }).ok) {
        toast.success("Период удалён");
        setSelectedId(null);
        setDetail(null);
        await loadPeriods();
      } else {
        toast.error((data as { message?: string })?.message || "Не удалось удалить период");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setDeletePeriodLoading(false);
    }
  }

  async function issueSalaryForSelectedPeriod() {
    if (!selectedId || !detail) return;
    if (!confirm(`Выдать зарплату за ${detail.dateFrom} - ${detail.dateTo}?`)) return;
    setIssueLoading(true);
    try {
      const res = await fetch(`/api/payroll/periods/${encodeURIComponent(selectedId)}/lines`, {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast.success("Зарплата выдана");
        await loadDetail(selectedId);
        await loadPeriods();
        if (mainTab === "payouts") void loadPayouts();
      } else toast.error(data?.message || "Ошибка выдачи зарплаты");
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setIssueLoading(false);
    }
  }

  async function createPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!newPeriod.label.trim() || !newPeriod.dateFrom || !newPeriod.dateTo) {
      toast.error("Заполните название и даты");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/periods", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newPeriod.label.trim(),
          dateFrom: newPeriod.dateFrom,
          dateTo: newPeriod.dateTo,
          comment: newPeriod.comment.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast.success("Период создан");
        setNewPeriod({ label: "", dateFrom: "", dateTo: "", comment: "" });
        await loadPeriods();
      } else toast.error(data?.message || "Ошибка создания периода");
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSaving(false);
    }
  }

  if (!can("salary_payroll")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
      </div>
    );
  }

  const tabBtn = (active: boolean) =>
    ({
      padding: "10px 18px",
      fontSize: 14,
      fontWeight: 600,
      borderRadius: 10,
      border: `1px solid ${active ? "var(--bo-accent)" : "var(--bo-border)"}`,
      background: active ? "rgba(20, 184, 166, 0.12)" : "var(--bo-surface)",
      color: active ? "var(--bo-accent)" : "var(--bo-text-muted)",
      cursor: "pointer",
      transition: "background 0.15s, color 0.15s, border-color 0.15s"
    }) as const;

  return (
    <div className="bo-salary-page" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div className="bo-page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 className="bo-page-title" style={{ marginBottom: 8 }}>
              Зарплаты
            </h1>
            <p className="bo-page-subtitle" style={{ margin: 0, maxWidth: 720 }}>
              Ведомости по периодам, расчёт продавцов и производства, фиксация выплат и история начислений.
            </p>
          </div>
          <Link href="/staff/salary-algorithm" className="bo-btn bo-btn-secondary" style={{ alignSelf: "center", textDecoration: "none" }}>
            Алгоритм расчёта
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
        <button type="button" style={tabBtn(mainTab === "ledger")} onClick={() => setMainTab("ledger")}>
          Ведомости и расчёт
        </button>
        <button type="button" style={tabBtn(mainTab === "payouts")} onClick={() => setMainTab("payouts")}>
          Выплаты и история
        </button>
      </div>

      {mainTab === "ledger" ? (
        <>
          {manage ? (
            <section
              className="bo-card bo-card-body"
              style={{ marginBottom: 24, borderRadius: 14, border: "1px solid var(--bo-border)" }}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700 }}>Новый учётный период</h2>
              <form
                onSubmit={createPeriod}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 12,
                  alignItems: "end"
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  Название
                  <input
                    className="bo-input"
                    placeholder="Напр. Март 2026"
                    value={newPeriod.label}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, label: e.target.value }))}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  С даты
                  <input
                    className="bo-input"
                    type="date"
                    value={newPeriod.dateFrom}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, dateFrom: e.target.value }))}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  По дату
                  <input
                    className="bo-input"
                    type="date"
                    value={newPeriod.dateTo}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, dateTo: e.target.value }))}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, gridColumn: "1 / -1" }}>
                  Комментарий (необязательно)
                  <input
                    className="bo-input"
                    placeholder="Заметка к периоду"
                    value={newPeriod.comment}
                    onChange={(e) => setNewPeriod((p) => ({ ...p, comment: e.target.value }))}
                  />
                </label>
                <div style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="bo-btn bo-btn-primary" disabled={saving}>
                    {saving ? "Создание…" : "Создать период"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: selectedId ? "minmax(280px, 360px) minmax(0, 1fr)" : "1fr",
              gap: 24,
              alignItems: "start"
            }}
          >
            <section className="bo-card bo-card-body" style={{ borderRadius: 14, position: "sticky", top: 12 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>Периоды</h2>
              {loading ? (
                <BoInlineTableSkeleton rows={8} />
              ) : periods.length === 0 ? (
                <p className="bo-muted" style={{ margin: 0 }}>
                  Пока нет периодов.{manage ? " Создайте первый выше." : ""}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {periods.map((p) => {
                    const amount = manage ? p.totalAmount : p.myAmount;
                    const selected = selectedId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedId(selected ? null : p.id)}
                        style={{
                          textAlign: "left",
                          padding: "14px 16px",
                          borderRadius: 12,
                          border: `1px solid ${selected ? "var(--bo-accent)" : "var(--bo-border)"}`,
                          background: selected ? "rgba(20, 184, 166, 0.1)" : "var(--bo-surface)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background 0.15s"
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: "var(--bo-text)" }}>{p.label}</div>
                        <div style={{ fontSize: 12, color: "var(--bo-text-muted)", marginBottom: 8 }}>
                          {p.dateFrom} — {p.dateTo}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--bo-accent)" }}>{fmtMoney(amount)} ₽</div>
                        <div style={{ fontSize: 11, color: "var(--bo-text-muted)", marginTop: 6 }}>
                          {manage ? `Продавцов: ${p.sellersCount} · Производство: ${p.mastersCount ?? 0}` : "Ваша сумма за период"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {selectedId ? (
              <section className="bo-card bo-card-body" style={{ borderRadius: 14, minHeight: 320 }}>
                {detailLoading ? (
                  <BoInlineTableSkeleton rows={14} />
                ) : detail ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 20,
                        flexWrap: "wrap",
                        gap: 12,
                        paddingBottom: 16,
                        borderBottom: "1px solid var(--bo-border)"
                      }}
                    >
                      <div>
                        <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>{detail.label}</h2>
                        <div style={{ fontSize: 14, color: "var(--bo-text-muted)" }}>
                          {detail.dateFrom} — {detail.dateTo}
                          {detail.comment ? ` · ${detail.comment}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {canDeletePayrollPeriod(user?.role) ? (
                          <button
                            type="button"
                            className="bo-btn bo-btn-secondary"
                            disabled={deletePeriodLoading}
                            onClick={() => void deleteSelectedPeriod()}
                            style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                          >
                            {deletePeriodLoading ? "Удаление…" : "Удалить период"}
                          </button>
                        ) : null}
                        {manage && !allIssuedForPeriod ? (
                          <button
                            type="button"
                            className="bo-btn bo-btn-primary"
                            disabled={issueLoading}
                            onClick={() => void issueSalaryForSelectedPeriod()}
                          >
                            {issueLoading ? "Выдача…" : "Зафиксировать выплату"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {manage ? (
                      <>
                        <div style={{ marginBottom: 20 }}>
                          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--bo-text-muted)" }}>
                            Продавцы
                          </h3>
                          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--bo-border)" }}>
                            <table className="bo-table" style={{ margin: 0, minWidth: 640 }}>
                              <thead>
                                <tr>
                                  <th>Сотрудник</th>
                                  <th>Магазин</th>
                                  <th style={{ textAlign: "right" }}>Продажи</th>
                                  <th style={{ textAlign: "right" }}>Ставка</th>
                                  <th style={{ textAlign: "right" }}>%</th>
                                  <th style={{ textAlign: "right" }}>К выплате</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.sellers.map((s) => (
                                  <tr key={s.userId}>
                                    <td>{s.name || s.email}</td>
                                    <td>{s.storeName || "—"}</td>
                                    <td style={{ textAlign: "right" }}>{fmtMoney(s.salesTotal)}</td>
                                    <td style={{ textAlign: "right" }}>{fmtMoney(s.baseAmount)}</td>
                                    <td style={{ textAlign: "right" }}>{s.percent.toFixed(2)}</td>
                                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                                      {fmtMoney(s.issuedAmount != null ? s.issuedAmount : s.salaryTotal)}
                                      {s.issuedAmount != null ? (
                                        <span style={{ fontSize: 11, color: "var(--bo-text-muted)", fontWeight: 500, marginLeft: 6 }}>выплачено</span>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--bo-text-muted)" }}>
                            Мастера и цех
                          </h3>
                          {(detail.masters ?? []).some((m) => m.assemblyTotal > 0 && (m.issuedAmount == null ? m.salaryTotal : m.issuedAmount) <= 0) ? (
                            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--bo-text-muted)", maxWidth: 720 }}>
                              У кого пул работ больше нуля, а ЗП ноль — проверьте{" "}
                              <Link href="/staff/salary-algorithm" style={{ color: "var(--bo-accent)" }}>
                                алгоритм расчёта
                              </Link>
                              .
                            </p>
                          ) : null}
                          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--bo-border)" }}>
                            <table className="bo-table" style={{ margin: 0, minWidth: 880 }}>
                              <thead>
                                <tr>
                                  <th>Сотрудник</th>
                                  <th>Роль</th>
                                  <th>Магазин</th>
                                  <th style={{ textAlign: "right" }}>Пул работ</th>
                                  <th style={{ textAlign: "right" }}>Ставка</th>
                                  <th style={{ textAlign: "right" }}>Доля %</th>
                                  <th style={{ textAlign: "right" }}>K</th>
                                  <th style={{ textAlign: "right" }}>К выплате</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(detail.masters ?? []).map((m) => {
                                  const canExpand = masterAssemblyExpandable(m);
                                  const bd = m.assemblyBreakdown ?? [];
                                  const enabledOps = masterEnabledOpsFromAlgorithm(m);
                                  const totPool = bd.reduce((s, r) => s + r.poolRub, 0);
                                  const totVar = bd.reduce((s, r) => s + r.variablePayRub, 0);
                                  const totInSal = bd.reduce((s, r) => s + r.variableInSalaryRub, 0);
                                  const open = Boolean(assemblyDetailOpen[m.userId]);
                                  return (
                                    <Fragment key={m.userId}>
                                      <tr>
                                        <td>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {canExpand ? (
                                              <button
                                                type="button"
                                                className="bo-btn-ghost"
                                                aria-expanded={open}
                                                aria-label={open ? "Скрыть разбивку по услугам" : "Показать разбивку по услугам"}
                                                onClick={() =>
                                                  setAssemblyDetailOpen((prev) => ({
                                                    ...prev,
                                                    [m.userId]: !prev[m.userId]
                                                  }))
                                                }
                                                style={{
                                                  flex: "0 0 auto",
                                                  padding: "2px 8px",
                                                  fontSize: 12,
                                                  borderRadius: 6,
                                                  border: "1px solid var(--bo-border)",
                                                  background: "var(--bo-surface)",
                                                  cursor: "pointer"
                                                }}
                                              >
                                                {open ? "▼" : "▶"}
                                              </button>
                                            ) : (
                                              <span style={{ width: 28, flex: "0 0 auto" }} aria-hidden />
                                            )}
                                            <span>{m.name || m.email}</span>
                                          </div>
                                        </td>
                                        <td>{m.accountRole === "worker" ? "Цех" : "Мастер"}</td>
                                        <td>{m.storeName || "—"}</td>
                                        <td style={{ textAlign: "right" }}>{fmtMoney(m.assemblyTotal)}</td>
                                        <td style={{ textAlign: "right" }}>{fmtMoney(m.baseAmount)}</td>
                                        <td style={{ textAlign: "right" }}>{m.masterSharePercent.toFixed(2)}</td>
                                        <td style={{ textAlign: "right" }}>{m.complexityMultiplier}</td>
                                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                                          {fmtMoney(m.issuedAmount != null ? m.issuedAmount : m.salaryTotal)}
                                          {m.issuedAmount != null ? (
                                            <span style={{ fontSize: 11, color: "var(--bo-text-muted)", fontWeight: 500, marginLeft: 6 }}>выплачено</span>
                                          ) : null}
                                        </td>
                                      </tr>
                                      {open && canExpand ? (
                                        <tr key={`${m.userId}-detail`}>
                                          <td colSpan={8} style={{ padding: 0, borderTop: "none", background: "rgba(0,0,0,0.02)" }}>
                                            <div style={{ padding: "12px 16px 16px 52px" }}>
                                              <div
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: 700,
                                                  textTransform: "uppercase",
                                                  letterSpacing: "0.04em",
                                                  color: "var(--bo-text-muted)",
                                                  marginBottom: 8
                                                }}
                                              >
                                                Список выполненных работ из алгоритма
                                              </div>
                                              <div style={{ marginBottom: 10, fontSize: 13 }}>
                                                {enabledOps.length > 0 ? (
                                                  enabledOps.map((op, idx) => (
                                                    <span key={op}>
                                                      {idx > 0 ? ", " : ""}
                                                      {op}
                                                    </span>
                                                  ))
                                                ) : (
                                                  <span style={{ color: "var(--bo-text-muted)" }}>Нет включённых операций в алгоритме</span>
                                                )}
                                              </div>
                                              {bd.length > 0 ? (
                                                <>
                                                  <table className="bo-table" style={{ margin: 0, maxWidth: 720, fontSize: 13 }}>
                                                    <thead>
                                                      <tr>
                                                        <th>Услуга</th>
                                                        <th style={{ textAlign: "right" }}>Пул работ, ₽</th>
                                                        <th style={{ textAlign: "right" }}>Начисление до K, ₽</th>
                                                        <th style={{ textAlign: "right" }}>В ЗП (× K), ₽</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {bd.map((row) => (
                                                        <tr key={row.code}>
                                                          <td>
                                                            {MASTER_ASSEMBLY_OP_LABELS[row.code] ?? row.code}
                                                            {row.enabledInAlgorithm === false ? (
                                                              <span
                                                                style={{
                                                                  fontSize: 11,
                                                                  color: "var(--bo-text-muted)",
                                                                  fontWeight: 500,
                                                                  marginLeft: 6
                                                                }}
                                                              >
                                                                (выкл. в алгоритме)
                                                              </span>
                                                            ) : null}
                                                          </td>
                                                          <td style={{ textAlign: "right" }}>{fmtMoney(row.poolRub)}</td>
                                                          <td style={{ textAlign: "right" }}>{fmtMoney(row.variablePayRub)}</td>
                                                          <td style={{ textAlign: "right" }}>{fmtMoney(row.variableInSalaryRub)}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                    <tfoot>
                                                      <tr style={{ fontWeight: 700, borderTop: "2px solid var(--bo-border)" }}>
                                                        <td>Итого по строкам</td>
                                                        <td style={{ textAlign: "right" }}>{fmtMoney(totPool)}</td>
                                                        <td style={{ textAlign: "right" }}>{fmtMoney(totVar)}</td>
                                                        <td style={{ textAlign: "right" }}>{fmtMoney(totInSal)}</td>
                                                      </tr>
                                                    </tfoot>
                                                  </table>
                                                  {Math.abs(totPool - m.assemblyTotal) > 0.02 ? (
                                                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309", maxWidth: 720 }}>
                                                      Сумма пула по услугам ({fmtMoney(totPool)}) не совпадает с колонкой «Пул работ» (
                                                      {fmtMoney(m.assemblyTotal)}). Обновите API или перезагрузите страницу.
                                                    </p>
                                                  ) : null}
                                                </>
                                              ) : (
                                                <p style={{ margin: 0, fontSize: 13, color: "var(--bo-text-muted)", maxWidth: 720 }}>
                                                  Детализация по услугам не пришла с сервера (нужна актуальная версия API). В расчёте по-прежнему
                                                  участвуют тарифы и галочки услуг из{" "}
                                                  <Link href="/staff/salary-algorithm" style={{ color: "var(--bo-accent)" }}>
                                                    алгоритма
                                                  </Link>
                                                  .
                                                </p>
                                              )}
                                              <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--bo-text-muted)", maxWidth: 720 }}>
                                                Пул — сумма по тарифам услуг с учётом потолка по сумме заказа; при нулевых долях по строкам
                                                применяется общая доля % от пула. Доля заказа между исполнителями делится поровну.
                                              </p>
                                            </div>
                                          </td>
                                        </tr>
                                      ) : null}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          padding: "28px 20px",
                          borderRadius: 12,
                          background: "rgba(20, 184, 166, 0.08)",
                          border: "1px solid rgba(20, 184, 166, 0.25)",
                          textAlign: "center"
                        }}
                      >
                        <div style={{ fontSize: 13, color: "var(--bo-text-muted)", marginBottom: 8 }}>Расчётная сумма за период</div>
                        <div style={{ fontSize: 36, fontWeight: 900, color: "var(--bo-accent)", letterSpacing: "-0.02em" }}>
                          {fmtMoney(detail.mySalary)} ₽
                        </div>
                        {detail.myIssued ? (
                          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "#15803d" }}>Выплата зафиксирована</div>
                        ) : (
                          <div style={{ marginTop: 12, fontSize: 13, color: "var(--bo-text-muted)" }}>
                            Выплата появится в истории после нажатия «Зафиксировать выплату» администратором
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bo-empty">Нет данных</div>
                )}
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {payoutLoading && !payoutSummary ? (
            <BoInlineTableSkeleton rows={6} />
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 16
                }}
              >
                {payoutSummary?.scope === "all" ? (
                  <>
                    <div
                      style={{
                        borderRadius: 14,
                        padding: "20px 22px",
                        background: "var(--bo-surface)",
                        border: "1px solid var(--bo-border)",
                        boxShadow: "0 2px 8px rgba(15, 40, 35, 0.06)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Всего выплачено
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: "var(--bo-text)" }}>{fmtMoney(payoutSummary.totalPaid)} ₽</div>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        padding: "20px 22px",
                        background: "var(--bo-surface)",
                        border: "1px solid var(--bo-border)",
                        boxShadow: "0 2px 8px rgba(15, 40, 35, 0.06)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Операций выплат
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{payoutSummary.payoutCount}</div>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        padding: "20px 22px",
                        background: "var(--bo-surface)",
                        border: "1px solid var(--bo-border)",
                        boxShadow: "0 2px 8px rgba(15, 40, 35, 0.06)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Сотрудников с выплатами
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{payoutSummary.employeesWithPayouts}</div>
                    </div>
                  </>
                ) : payoutSummary?.scope === "me" ? (
                  <>
                    <div
                      style={{
                        borderRadius: 14,
                        padding: "20px 22px",
                        background: "var(--bo-surface)",
                        border: "1px solid var(--bo-border)",
                        boxShadow: "0 2px 8px rgba(15, 40, 35, 0.06)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Вам выплачено всего
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: "var(--bo-accent)" }}>{fmtMoney(payoutSummary.totalPaid)} ₽</div>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        padding: "20px 22px",
                        background: "var(--bo-surface)",
                        border: "1px solid var(--bo-border)",
                        boxShadow: "0 2px 8px rgba(15, 40, 35, 0.06)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bo-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Записей в истории
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{payoutSummary.payoutCount}</div>
                    </div>
                  </>
                ) : null}
              </div>

              <section className="bo-card bo-card-body" style={{ borderRadius: 14 }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 16,
                    marginBottom: 20
                  }}
                >
                  <div>
                    <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800 }}>История выплат</h2>
                    <p style={{ margin: 0, fontSize: 14, color: "var(--bo-text-muted)", maxWidth: 560 }}>
                      {manage
                        ? "Общая лента по всем сотрудникам или фильтр по одному. Данные из зафиксированных выплат по ведомостям."
                        : "Все зафиксированные выплаты на вашу учётную запись."}
                    </p>
                  </div>
                  {manage ? (
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, minWidth: 240 }}>
                      Сотрудник
                      <select
                        className="bo-select"
                        value={historyUserId}
                        onChange={(e) => setHistoryUserId(e.target.value)}
                        style={{ minWidth: 260 }}
                      >
                        <option value="">Все сотрудники</option>
                        {staffUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name?.trim() || u.email} ({u.role})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                {payoutLoading ? (
                  <BoInlineTableSkeleton rows={10} />
                ) : payoutLines.length === 0 ? (
                  <p className="bo-muted" style={{ margin: 0 }}>
                    Пока нет зафиксированных выплат. После «Зафиксировать выплату» в ведомости записи появятся здесь.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--bo-border)" }}>
                    <table className="bo-table" style={{ margin: 0, minWidth: manage ? 720 : 520 }}>
                      <thead>
                        <tr>
                          <th>Период</th>
                          <th>Даты учёта</th>
                          {manage && !historyUserId.trim() ? <th>Сотрудник</th> : null}
                          <th style={{ textAlign: "right" }}>Сумма</th>
                          <th>Комментарий</th>
                          <th style={{ fontSize: 12 }}>Запись</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payoutLines.map((line) => (
                          <tr key={line.id}>
                            <td style={{ fontWeight: 600 }}>{line.period.label}</td>
                            <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                              {line.period.dateFrom} — {line.period.dateTo}
                            </td>
                            {manage && !historyUserId.trim() ? (
                              <td>
                                <div>{line.user.name?.trim() || "—"}</div>
                                <div style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>{line.user.email}</div>
                              </td>
                            ) : null}
                            <td style={{ textAlign: "right", fontWeight: 800, color: "var(--bo-accent)" }}>{fmtMoney(line.amount)} ₽</td>
                            <td style={{ fontSize: 13, color: "var(--bo-text-muted)", maxWidth: 220 }}>{line.note?.trim() || "—"}</td>
                            <td style={{ fontSize: 12, color: "var(--bo-text-muted)", whiteSpace: "nowrap" }}>
                              {new Date(line.createdAt).toLocaleString("ru-RU")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
