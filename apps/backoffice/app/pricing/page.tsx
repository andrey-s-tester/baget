"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { PriceBreakdown } from "@yanak/types";

type PricingRules = {
  frameWasteCoeff: number;
  assemblyPrice: number;
  minimalOrderPrice: number;
  matboardPricePerM2: number;
  glassPrices: { id: string; name: string; price: number }[];
  backingPrices: { id: string; name: string; price: number }[];
};

export default function PricingPage() {
  const [rules, setRules] = useState<PricingRules | null>(null);
  const [widthMm, setWidthMm] = useState(304);
  const [heightMm, setHeightMm] = useState(600);
  const [framePricePerMeter, setFramePricePerMeter] = useState(10056);
  const [frameProfileWidthMm, setFrameProfileWidthMm] = useState(40);
  const [result, setResult] = useState<PriceBreakdown | null>(null);
  const [editForm, setEditForm] = useState({ frameWasteCoeff: 1.1, assemblyPrice: 750, minimalOrderPrice: 1500, matboardPricePerM2: 14552 });
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/pricing", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      setRules(data);
      setEditForm({
        frameWasteCoeff: data.frameWasteCoeff ?? 1.1,
        assemblyPrice: data.assemblyPrice ?? 750,
        minimalOrderPrice: data.minimalOrderPrice ?? 1500,
        matboardPricePerM2: data.matboardPricePerM2 ?? 14552,
      });
    } catch {
      setRules(null);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function saveRules() {
    setSaving(true);
    try {
      const res = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.ok) {
        setRules(data.rules);
        toast.success("Настройки сохранены");
      } else {
        toast.error(data.message || "Ошибка сохранения");
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSaving(false);
    }
  }

  async function runCalc() {
    if (!rules) return;
    const glassPrice = rules.glassPrices[1]?.price ?? 2000;
    const backingPrice = rules.backingPrices[0]?.price ?? 875;
    try {
      const res = await fetch("/api/pricing/calculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          widthMm,
          heightMm,
          framePricePerMeter,
          frameWasteCoeff: rules.frameWasteCoeff,
          frameProfileWidthMm,
          matboardPricePerM2: rules.matboardPricePerM2,
          glassPricePerM2: glassPrice,
          backingPricePerM2: backingPrice,
          assemblyPrice: rules.assemblyPrice,
          minimalOrderPrice: rules.minimalOrderPrice
        })
      });
      if (!res.ok) throw new Error("calc_failed");
      const data = (await res.json()) as Partial<PriceBreakdown>;
      if (typeof data.total !== "number") throw new Error("invalid_calc");
      setResult({
        frame: Number(data.frame ?? 0),
        matboard: Number(data.matboard ?? 0),
        glass: Number(data.glass ?? 0),
        backing: Number(data.backing ?? 0),
        assembly: Number(data.assembly ?? 0),
        rush: Number(data.rush ?? 0),
        discount: Number(data.discount ?? 0),
        total: Number(data.total ?? 0)
      });
    } catch {
      toast.error("Не удалось выполнить расчёт");
    }
  }

  return (
    <>
      <div className="bo-page-header">
        <h1 className="bo-page-title">Цены и правила расчёта</h1>
        <p className="bo-page-subtitle">Формула, параметры по умолчанию, тестовый калькулятор</p>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Формула</h2>
        <div className="bo-card bo-card-body" style={{ fontFamily: "monospace", fontSize: 13 }}>
          <div>L_м = (2 × (ширина_мм + высота_мм) + 8 × W) / 1000</div>
          <div>W — ширина багетного профиля (мм)</div>
          <div>площадь_м² = ширина_мм × высота_мм / 1 000 000</div>
          <br />
          <div>багет = L_м × цена_за_м</div>
          <div>паспарту = площадь_м² × цена_паспарту_за_м²</div>
          <div>стекло = площадь_м² × цена_стекла_за_м²</div>
          <div>задник = площадь_м² × цена_задника_за_м²</div>
          <br />
          <div>итого = багет + паспарту + стекло + задник + сборка + срочность − скидка</div>
          <div>итого = max(итого, минимальный_заказ)</div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Параметры по умолчанию</h2>
        <div className="bo-card">
          <table className="bo-table">
            <thead>
              <tr>
                <th>Параметр</th>
                <th style={{ textAlign: "right" }}>Значение</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "12px 16px" }}>frameWasteCoeff</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="bo-input"
                    value={editForm.frameWasteCoeff}
                    onChange={(e) => setEditForm((p) => ({ ...p, frameWasteCoeff: Number(e.target.value) || 1 }))}
                    style={{ width: 80, textAlign: "right" }}
                  />
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>
                  Доп. коэффициент отхода (используется только если W не задан)
                </td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px" }}>assemblyPrice</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <input
                    type="number"
                    className="bo-input"
                    value={editForm.assemblyPrice}
                    onChange={(e) => setEditForm((p) => ({ ...p, assemblyPrice: Number(e.target.value) || 0 }))}
                    style={{ width: 100, textAlign: "right" }}
                  />{" "}
                  руб.
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>
                  Сборка
                </td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px" }}>minimalOrderPrice</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <input
                    type="number"
                    className="bo-input"
                    value={editForm.minimalOrderPrice}
                    onChange={(e) => setEditForm((p) => ({ ...p, minimalOrderPrice: Number(e.target.value) || 0 }))}
                    style={{ width: 100, textAlign: "right" }}
                  />{" "}
                  руб.
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>
                  Минимальная сумма заказа
                </td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px" }}>matboardPricePerM2</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <input
                    type="number"
                    className="bo-input"
                    value={editForm.matboardPricePerM2}
                    onChange={(e) => setEditForm((p) => ({ ...p, matboardPricePerM2: Number(e.target.value) || 0 }))}
                    style={{ width: 100, textAlign: "right" }}
                  />{" "}
                  руб./м²
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>
                  Паспарту за м²
                </td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px" }}>framePricePerMeter</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>из каталога</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>
                  Цена багета за пог. м (retailPriceMeter)
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--bo-border)" }}>
            <button
              type="button"
              className="bo-btn bo-btn-primary"
              onClick={saveRules}
              disabled={saving}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Материалы</h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--bo-text-muted)" }}>
          <Link href="/materials" className="bo-link">
            Подробный справочник материалов
          </Link>{" "}
          — паспарту, стекло, задник.
        </p>
      </section>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Калькулятор</h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Тестовый расчёт: 304×600 мм, обычное стекло, картон, паспарту.
        </p>
        <div className="bo-form-row">
          <label>
            <span>Ширина (мм)</span>
            <input
              type="number"
              className="bo-input"
              value={widthMm}
              onChange={(e) => setWidthMm(Number(e.target.value) || 0)}
              style={{ width: 100 }}
            />
          </label>
          <label>
            <span>Высота (мм)</span>
            <input
              type="number"
              className="bo-input"
              value={heightMm}
              onChange={(e) => setHeightMm(Number(e.target.value) || 0)}
              style={{ width: 100 }}
            />
          </label>
          <label>
            <span>Цена багета за м (руб.)</span>
            <input
              type="number"
              className="bo-input"
              value={framePricePerMeter}
              onChange={(e) => setFramePricePerMeter(Number(e.target.value) || 0)}
              style={{ width: 120 }}
            />
          </label>
          <label>
            <span>Ширина профиля W (мм)</span>
            <input
              type="number"
              className="bo-input"
              value={frameProfileWidthMm}
              onChange={(e) => setFrameProfileWidthMm(Number(e.target.value) || 0)}
              style={{ width: 140 }}
            />
          </label>
          <button type="button" className="bo-btn bo-btn-primary" onClick={runCalc}>
            Рассчитать
          </button>
        </div>
        {result && (
          <div className="bo-card bo-card-body">
            <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Багет</span>
                <strong>{result.frame.toLocaleString("ru-RU")} руб.</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Паспарту</span>
                <strong>{result.matboard.toLocaleString("ru-RU")} руб.</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Стекло</span>
                <strong>{result.glass.toLocaleString("ru-RU")} руб.</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Задник</span>
                <strong>{result.backing.toLocaleString("ru-RU")} руб.</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Сборка</span>
                <strong>{result.assembly.toLocaleString("ru-RU")} руб.</strong>
              </div>
            </div>
            <div
              style={{
                borderTop: "2px solid var(--bo-border)",
                paddingTop: 16,
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              <span>Итого</span>
              <span style={{ color: "var(--bo-accent)" }}>{result.total.toLocaleString("ru-RU")} руб.</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
