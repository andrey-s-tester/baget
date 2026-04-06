"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BoCardPageSkeleton } from "../components/BoPageSkeleton";
import { useBackofficeSession } from "../components/BackofficeSession";

type PromoCode = {
  code: string;
  discountPercent: number | null;
  discountAmount: number | null;
  isActive: boolean;
};

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
};

export default function PromotionsPage() {
  const { permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty =
    !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPromo, setNewPromo] = useState({ code: "", discountPercent: "", discountAmount: "" });
  const [newCampaign, setNewCampaign] = useState({
    title: "",
    description: "",
    validFrom: "",
    validUntil: ""
  });

  const fetchOpts: RequestInit = { credentials: "include", cache: "no-store" };

  async function load() {
    setLoading(true);
    try {
      const [promoRes, campRes] = await Promise.all([
        fetch("/api/promo-codes", fetchOpts),
        fetch("/api/campaigns", fetchOpts)
      ]);
      const promoData = await promoRes.json();
      const campData = await campRes.json();
      setPromoCodes(Array.isArray(promoData) ? promoData : []);
      setCampaigns(Array.isArray(campData) ? campData : []);
    } catch {
      setPromoCodes([]);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const addPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newPromo.code.trim().toUpperCase();
    const pct = newPromo.discountPercent ? Number(newPromo.discountPercent) : null;
    const amt = newPromo.discountAmount ? Number(newPromo.discountAmount) : null;
    if (!code || (pct == null && amt == null)) return;
    try {
      const res = await fetch("/api/promo-codes", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          discountPercent: pct,
          discountAmount: amt
        })
      });
      const data = await res.json();
      if (data.ok) {
        setNewPromo({ code: "", discountPercent: "", discountAmount: "" });
        await load();
        toast.success("Промокод создан");
      } else {
        toast.error(data.message || "Не удалось создать промокод");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  const togglePromo = async (code: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/promo-codes", {
        ...fetchOpts,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, isActive })
      });
      const data = await res.json();
      if (data.ok) {
        await load();
        toast.success(isActive ? "Промокод включён" : "Промокод отключён");
      } else {
        toast.error(data.message || "Ошибка обновления");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  const addCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newCampaign.title.trim();
    if (!title) return;
    try {
      const res = await fetch("/api/campaigns", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: newCampaign.description.trim() || null,
          validFrom: newCampaign.validFrom || null,
          validUntil: newCampaign.validUntil || null
        })
      });
      const data = await res.json();
      if (data.ok) {
        setNewCampaign({ title: "", description: "", validFrom: "", validUntil: "" });
        await load();
        toast.success("Акция добавлена");
      } else {
        toast.error(data.message || "Не удалось сохранить");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  const toggleCampaign = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/campaigns", {
        ...fetchOpts,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive })
      });
      const data = await res.json();
      if (data.ok) {
        await load();
        toast.success(isActive ? "Акция активна" : "Акция отключена");
      } else {
        toast.error(data.message || "Ошибка");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Удалить акцию?")) return;
    try {
      const res = await fetch("/api/campaigns", {
        ...fetchOpts,
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.ok) {
        await load();
        toast.success("Удалено");
      } else {
        toast.error(data.message || "Ошибка");
      }
    } catch {
      toast.error("Ошибка соединения");
    }
  };

  if (loading) return <BoCardPageSkeleton />;

  if (!can("staff_discounts")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Акции и промо» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        dateStyle: "short",
        timeStyle: "short"
      });
    } catch {
      return "—";
    }
  }

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Акции и промо</h1>
        <p className="bo-page-subtitle">
          Промокоды для расчёта цены и маркетинговые акции (текст, сроки) для витрины
        </p>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Промокоды</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--bo-text-muted)" }}>
          Коды применяются в конструкторе при оформлении заказа.
        </p>
        <form onSubmit={addPromo} className="bo-form-row">
          <input
            className="bo-input"
            placeholder="Код (напр. SALE10)"
            value={newPromo.code}
            onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))}
            style={{ minWidth: 120 }}
          />
          <input
            className="bo-input"
            placeholder="% скидки"
            type="number"
            value={newPromo.discountPercent}
            onChange={(e) => setNewPromo((p) => ({ ...p, discountPercent: e.target.value }))}
            style={{ width: 90 }}
          />
          <span style={{ alignSelf: "center", color: "var(--bo-text-muted)" }}>или</span>
          <input
            className="bo-input"
            placeholder="Сумма руб."
            type="number"
            value={newPromo.discountAmount}
            onChange={(e) => setNewPromo((p) => ({ ...p, discountAmount: e.target.value }))}
            style={{ width: 90 }}
          />
          <button type="submit" className="bo-btn bo-btn-primary" style={{ background: "#15803d" }}>
            Добавить
          </button>
        </form>
        <div className="bo-card">
          <table className="bo-table">
            <thead>
              <tr>
                <th>Код</th>
                <th style={{ textAlign: "right" }}>Скидка</th>
                <th style={{ textAlign: "center" }}>Активен</th>
              </tr>
            </thead>
            <tbody>
              {promoCodes.map((p) => (
                <tr key={p.code}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{p.code}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    {p.discountPercent != null
                      ? `${p.discountPercent}%`
                      : p.discountAmount != null
                        ? `${p.discountAmount} руб.`
                        : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => togglePromo(p.code, !p.isActive)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "none",
                        cursor: "pointer",
                        background: p.isActive ? "#dcfce7" : "#fee2e2",
                        color: p.isActive ? "#166534" : "#991b1b"
                      }}
                    >
                      {p.isActive ? "Да" : "Нет"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Маркетинговые акции</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--bo-text-muted)" }}>
          Название, описание и сроки. Активные акции можно подтягивать на витрину через публичный метод API{" "}
          <code style={{ fontSize: 12 }}>GET /api/campaigns/active</code>.
        </p>
        <form onSubmit={addCampaign} className="bo-form-row" style={{ flexWrap: "wrap", gap: 10 }}>
          <input
            className="bo-input"
            placeholder="Название акции"
            value={newCampaign.title}
            onChange={(e) => setNewCampaign((p) => ({ ...p, title: e.target.value }))}
            style={{ minWidth: 200, flex: "1 1 180px" }}
          />
          <input
            className="bo-input"
            placeholder="Описание (опц.)"
            value={newCampaign.description}
            onChange={(e) => setNewCampaign((p) => ({ ...p, description: e.target.value }))}
            style={{ minWidth: 200, flex: "2 1 240px" }}
          />
          <input
            className="bo-input"
            type="datetime-local"
            title="Дата начала"
            value={newCampaign.validFrom}
            onChange={(e) => setNewCampaign((p) => ({ ...p, validFrom: e.target.value }))}
            style={{ minWidth: 160 }}
          />
          <input
            className="bo-input"
            type="datetime-local"
            title="Дата окончания"
            value={newCampaign.validUntil}
            onChange={(e) => setNewCampaign((p) => ({ ...p, validUntil: e.target.value }))}
            style={{ minWidth: 160 }}
          />
          <button type="submit" className="bo-btn bo-btn-primary">
            Добавить акцию
          </button>
        </form>
        <div className="bo-card" style={{ marginTop: 16 }}>
          {campaigns.length === 0 ? (
            <div className="bo-empty">Пока нет акций</div>
          ) : (
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Описание</th>
                  <th>Начало</th>
                  <th>Окончание</th>
                  <th style={{ textAlign: "center" }}>Активна</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.title}</td>
                    <td style={{ padding: "12px 16px", color: "var(--bo-text-muted)", fontSize: 13 }}>
                      {c.description || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{fmtDate(c.validFrom)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{fmtDate(c.validUntil)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => toggleCampaign(c.id, !c.isActive)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 4,
                          border: "none",
                          cursor: "pointer",
                          background: c.isActive ? "#dcfce7" : "#fee2e2",
                          color: c.isActive ? "#166534" : "#991b1b"
                        }}
                      >
                        {c.isActive ? "Да" : "Нет"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        type="button"
                        className="bo-btn bo-btn-ghost"
                        style={{ fontSize: 12, color: "#dc2626" }}
                        onClick={() => void deleteCampaign(c.id)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
