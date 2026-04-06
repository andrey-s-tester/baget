"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { BoInlineTableSkeleton } from "../../components/BoPageSkeleton";
import { useBackofficeSession } from "../../components/BackofficeSession";

const SalaryAlgorithmHelpModalDynamic = dynamic(
  () => import("./SalaryAlgorithmHelpModal").then((m) => ({ default: m.SalaryAlgorithmHelpModal })),
  { ssr: false, loading: () => null }
);

type SellerRule = {
  userId: string;
  email: string;
  name: string | null;
  storeId: string | null;
  storeName: string | null;
  baseAmount: number;
  percent: number;
};

type PayMode = "percent" | "fixed";

type FrameAssemblyRevenueSource = "perimeter_tariff" | "order_assembly_then_frame";
type CanvasStretchRevenueSource = "area_tariff" | "order_canvas" | `order_material:${string}`;
type GlassRevenueSource = "unit_tariff" | "order_glass";
type BackingRevenueSource = "unit_tariff" | "order_backing";
type MatCutRevenueSource = "unit_tariff" | "order_matboard";

type MasterRule = {
  userId: string;
  email: string;
  name: string | null;
  storeId: string | null;
  storeName: string | null;
  accountRole?: string;
  baseAmount: number;
  masterSharePercent: number;
  complexityMultiplier: number;
  doesFrameAssembly: boolean;
  doesCanvasStretch: boolean;
  doesGlass: boolean;
  doesBacking: boolean;
  doesMatCut: boolean;
  frameAssemblyRatePerMeter: number;
  frameAssemblyPayMode: PayMode;
  frameAssemblySharePercent: number;
  frameAssemblyRevenueSource: FrameAssemblyRevenueSource;
  canvasStretchRatePerM2: number;
  canvasStretchPayMode: PayMode;
  canvasStretchSharePercent: number;
  canvasStretchRevenueSource: CanvasStretchRevenueSource;
  glassCutRatePerUnit: number;
  glassInstallRatePerUnit: number;
  glassPayMode: PayMode;
  glassSharePercent: number;
  glassRevenueSource: GlassRevenueSource;
  backingCutRatePerUnit: number;
  backingInstallRatePerUnit: number;
  backingPayMode: PayMode;
  backingSharePercent: number;
  backingRevenueSource: BackingRevenueSource;
  matCutRatePerUnit: number;
  matPayMode: PayMode;
  matSharePercent: number;
  matCutRevenueSource: MatCutRevenueSource;
};

type MainTab = "sellers" | "masters";

type MaterialBindOption = {
  value: string;
  label: string;
};

type MaterialsApiResponse = {
  backing?: Array<{ id?: string; name?: string }>;
};

function isManageRole(role: string | undefined) {
  return role === "owner" || role === "admin" || role === "manager";
}

function modeLabel(mode: PayMode) {
  return mode === "percent" ? "%" : "руб/ед.";
}

function normalizeMasterRule(m: MasterRule): MasterRule {
  const canvasRaw = String(m.canvasStretchRevenueSource ?? "");
  return {
    ...m,
    doesFrameAssembly: m.doesFrameAssembly !== false,
    doesCanvasStretch: m.doesCanvasStretch !== false,
    doesGlass: m.doesGlass !== false,
    doesBacking: m.doesBacking !== false,
    doesMatCut: m.doesMatCut !== false,
    frameAssemblyRevenueSource:
      m.frameAssemblyRevenueSource === "order_assembly_then_frame"
        ? "order_assembly_then_frame"
        : "perimeter_tariff",
    canvasStretchRevenueSource:
      canvasRaw === "order_canvas" || canvasRaw === "order_backing" || canvasRaw.startsWith("order_material:")
        ? (canvasRaw === "order_backing" ? "order_canvas" : (canvasRaw as CanvasStretchRevenueSource))
        : "area_tariff",
    glassRevenueSource: m.glassRevenueSource === "order_glass" ? "order_glass" : "unit_tariff",
    backingRevenueSource: m.backingRevenueSource === "order_backing" ? "order_backing" : "unit_tariff",
    matCutRevenueSource: m.matCutRevenueSource === "order_matboard" ? "order_matboard" : "unit_tariff"
  };
}

function masterActiveOpsCount(r: MasterRule): number {
  return [
    r.doesFrameAssembly,
    r.doesCanvasStretch,
    r.doesGlass,
    r.doesBacking,
    r.doesMatCut
  ].filter(Boolean).length;
}

function masterInitials(name: string | null, email: string): string {
  const s = (name || email).trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

const shell: CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  minWidth: 0
};

const labelSm: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--bo-text-muted)",
  letterSpacing: "0.02em",
  marginBottom: 6,
  display: "block"
};

function MasterEditor({
  r,
  patch,
  onSave,
  saving,
  materialBindOptions
}: {
  r: MasterRule;
  patch: (p: Partial<MasterRule>) => void;
  onSave: (row: MasterRule) => void;
  saving: boolean;
  materialBindOptions: MaterialBindOption[];
}) {
  const roleLabel = r.accountRole === "worker" ? "Цех" : "Мастер";
  const active = masterActiveOpsCount(r);

  const cardBase: CSSProperties = {
    border: "1px solid var(--bo-border)",
    borderRadius: "var(--bo-radius-sm)",
    padding: 14,
    background: "var(--bo-surface)",
    transition: "opacity 0.15s ease, border-color 0.15s ease",
    minWidth: 0
  };

  return (
    <div className="salary-master-editor" style={{ display: "flex", flexDirection: "column", gap: 20, minHeight: 0, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          paddingBottom: 18,
          borderBottom: "1px solid var(--bo-border)"
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--bo-radius-sm)",
              background: "linear-gradient(145deg, var(--bo-accent-soft-strong), var(--bo-accent-soft))",
              color: "var(--bo-accent-hover)",
              fontWeight: 800,
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            {masterInitials(r.name, r.email)}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {r.name || r.email}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
              {r.email}
              {r.storeName ? ` · ${r.storeName}` : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "var(--bo-accent-soft)",
                  color: "var(--bo-accent)"
                }}
              >
                {roleLabel}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(15, 118, 110, 0.12)",
                  color: "var(--bo-accent-hover)"
                }}
              >
                {active} из 5 операций в ЗП
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="bo-btn bo-btn-primary"
          onClick={() => onSave(r)}
          disabled={saving}
          style={{ minWidth: 140 }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      <section>
        <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--bo-text-muted)" }}>
          Базовые параметры
        </h3>
        <div
          className="salary-algo-base-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
            gap: 14
          }}
        >
          <div style={{ ...cardBase, boxShadow: "var(--bo-shadow)" }}>
            <span style={labelSm}>Ставка, ₽</span>
            <input
              className="bo-input"
              type="number"
              min={0}
              step="0.01"
              value={r.baseAmount}
              onChange={(e) => patch({ baseAmount: Number(e.target.value) || 0 })}
            />
          </div>
          <div style={{ ...cardBase, boxShadow: "var(--bo-shadow)" }}>
            <span style={labelSm}>K — сложность</span>
            <input
              className="bo-input"
              type="number"
              min={0}
              step="0.01"
              value={r.complexityMultiplier}
              onChange={(e) => patch({ complexityMultiplier: Number(e.target.value) || 0 })}
            />
          </div>
          <div style={{ ...cardBase, boxShadow: "var(--bo-shadow)" }}>
            <span style={labelSm}>Доля % (упрощ.)</span>
            <input
              className="bo-input"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={r.masterSharePercent}
              onChange={(e) => patch({ masterSharePercent: Number(e.target.value) || 0 })}
              title="Если тарифы клиента дают выручку, а оплаты по строкам нули — % от этой выручки"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--bo-text-muted)" }}>
          Операции в заказе
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--bo-text-muted)", lineHeight: 1.5, maxWidth: 640 }}>
          Включите только те работы, которые делает этот сотрудник. Поля тарифа можно заполнять заранее — пока операция выключена, она не влияет на расчёт.
        </p>

        <div
          className="salary-op-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
            gap: 12
          }}
        >
          {/* Сборка рамы */}
          <div
            style={{
              ...cardBase,
              opacity: r.doesFrameAssembly ? 1 : 0.72,
              borderLeft: r.doesFrameAssembly ? "4px solid var(--bo-accent)" : "4px solid var(--bo-border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Сборка рамы (м.п.)</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={r.doesFrameAssembly}
                  onChange={(e) => patch({ doesFrameAssembly: e.target.checked })}
                />
                В ЗП
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, minWidth: 0 }}>
              <div>
                <span style={labelSm}>Откуда брать сумму для пула ЗП</span>
                <select
                  className="bo-select"
                  style={{ width: "100%" }}
                  disabled={!r.doesFrameAssembly}
                  value={r.frameAssemblyRevenueSource}
                  onChange={(e) =>
                    patch({ frameAssemblyRevenueSource: e.target.value as FrameAssemblyRevenueSource })
                  }
                >
                  <option value="perimeter_tariff">Тариф × периметр (как в таблице ниже)</option>
                  <option value="order_assembly_then_frame">
                    Из чека заказа: «Сборка» (цена из правил), если 0 — сумма «Багет»
                  </option>
                </select>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--bo-text-muted)", lineHeight: 1.45 }}>
                  Если сборка в цене уже «внутри» багета — в правилах поставьте сборку 0 и выберите второй вариант: пул
                  возьмётся с багета. Отдельная строка сборки в чеке — пул с неё.
                </p>
              </div>
              <div>
                <span style={labelSm}>Тариф клиента, ₽/м.п.</span>
                <input
                  className="bo-input"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!r.doesFrameAssembly}
                  value={r.frameAssemblyRatePerMeter}
                  onChange={(e) => patch({ frameAssemblyRatePerMeter: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="salary-op-field-row">
                <div>
                  <span style={labelSm}>Режим</span>
                  <select
                    className="bo-select"
                    style={{ width: "100%" }}
                    disabled={!r.doesFrameAssembly}
                    value={r.frameAssemblyPayMode}
                    onChange={(e) => patch({ frameAssemblyPayMode: e.target.value as PayMode })}
                  >
                    <option value="percent">Процент</option>
                    <option value="fixed">Фикс / м.п.</option>
                  </select>
                </div>
                <div>
                  <span style={labelSm}>Оплата ({modeLabel(r.frameAssemblyPayMode)})</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesFrameAssembly}
                    value={r.frameAssemblySharePercent}
                    onChange={(e) => patch({ frameAssemblySharePercent: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Натяжка */}
          <div
            style={{
              ...cardBase,
              opacity: r.doesCanvasStretch ? 1 : 0.72,
              borderLeft: r.doesCanvasStretch ? "4px solid var(--bo-accent)" : "4px solid var(--bo-border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Натяжка холста (м²)</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={r.doesCanvasStretch}
                  onChange={(e) => patch({ doesCanvasStretch: e.target.checked })}
                />
                В ЗП
              </label>
            </div>
            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
              <div>
                <span style={labelSm}>Откуда брать сумму для пула ЗП</span>
                <select
                  className="bo-select"
                  style={{ width: "100%" }}
                  disabled={!r.doesCanvasStretch}
                  value={r.canvasStretchRevenueSource}
                  onChange={(e) =>
                    patch({ canvasStretchRevenueSource: e.target.value as CanvasStretchRevenueSource })
                  }
                >
                  <option value="area_tariff">Тариф × м² проёма (как в таблице ниже)</option>
                  <option value="order_canvas">
                    Связать с холстом: сумма материала натяжки в чеке (строка «Задник» для натяжки/подрамника)
                  </option>
                  {materialBindOptions.length > 0 ? (
                    <optgroup label="Конкретный материал (из /materials)">
                      {materialBindOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--bo-text-muted)", lineHeight: 1.45 }}>
                  В чеке строка «Задник» совпадает с расчётом натяжки по м² из конструктора. Нужны сохранённые в заказе
                  суммы чека (frame, backing, …).
                </p>
              </div>
              <div>
                <span style={labelSm}>Тариф клиента, ₽/м²</span>
                <input
                  className="bo-input"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!r.doesCanvasStretch}
                  value={r.canvasStretchRatePerM2}
                  onChange={(e) => patch({ canvasStretchRatePerM2: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="salary-op-field-row">
                <div>
                  <span style={labelSm}>Режим</span>
                  <select
                    className="bo-select"
                    style={{ width: "100%" }}
                    disabled={!r.doesCanvasStretch}
                    value={r.canvasStretchPayMode}
                    onChange={(e) => patch({ canvasStretchPayMode: e.target.value as PayMode })}
                  >
                    <option value="percent">Процент</option>
                    <option value="fixed">Фикс / м²</option>
                  </select>
                </div>
                <div>
                  <span style={labelSm}>Оплата ({modeLabel(r.canvasStretchPayMode)})</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesCanvasStretch}
                    value={r.canvasStretchSharePercent}
                    onChange={(e) => patch({ canvasStretchSharePercent: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Стекло */}
          <div
            style={{
              ...cardBase,
              opacity: r.doesGlass ? 1 : 0.72,
              borderLeft: r.doesGlass ? "4px solid var(--bo-accent)" : "4px solid var(--bo-border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Стекло (шт)</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <input type="checkbox" checked={r.doesGlass} onChange={(e) => patch({ doesGlass: e.target.checked })} />
                В ЗП
              </label>
            </div>
            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
              <div>
                <span style={labelSm}>Откуда брать сумму для пула ЗП</span>
                <select
                  className="bo-select"
                  style={{ width: "100%" }}
                  disabled={!r.doesGlass}
                  value={r.glassRevenueSource}
                  onChange={(e) => patch({ glassRevenueSource: e.target.value as GlassRevenueSource })}
                >
                  <option value="unit_tariff">Тариф резка + установка</option>
                  <option value="order_glass">Сумма «Стекло» в чеке заказа</option>
                </select>
              </div>
              <div className="salary-op-field-row">
                <div>
                  <span style={labelSm}>Резка, ₽</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesGlass}
                    value={r.glassCutRatePerUnit}
                    onChange={(e) => patch({ glassCutRatePerUnit: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <span style={labelSm}>Установка, ₽</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesGlass}
                    value={r.glassInstallRatePerUnit}
                    onChange={(e) => patch({ glassInstallRatePerUnit: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="salary-op-field-row">
                <div>
                  <span style={labelSm}>Режим</span>
                  <select
                    className="bo-select"
                    style={{ width: "100%" }}
                    disabled={!r.doesGlass}
                    value={r.glassPayMode}
                    onChange={(e) => patch({ glassPayMode: e.target.value as PayMode })}
                  >
                    <option value="percent">Процент</option>
                    <option value="fixed">Фикс / шт</option>
                  </select>
                </div>
                <div>
                  <span style={labelSm}>Оплата ({modeLabel(r.glassPayMode)})</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesGlass}
                    value={r.glassSharePercent}
                    onChange={(e) => patch({ glassSharePercent: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Задник */}
          <div
            style={{
              ...cardBase,
              opacity: r.doesBacking ? 1 : 0.72,
              borderLeft: r.doesBacking ? "4px solid var(--bo-accent)" : "4px solid var(--bo-border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Задник (шт)</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <input type="checkbox" checked={r.doesBacking} onChange={(e) => patch({ doesBacking: e.target.checked })} />
                В ЗП
              </label>
            </div>
            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
              <div>
                <span style={labelSm}>Откуда брать сумму для пула ЗП</span>
                <select
                  className="bo-select"
                  style={{ width: "100%" }}
                  disabled={!r.doesBacking}
                  value={r.backingRevenueSource}
                  onChange={(e) => patch({ backingRevenueSource: e.target.value as BackingRevenueSource })}
                >
                  <option value="unit_tariff">Тариф резка + установка</option>
                  <option value="order_backing">Сумма «Задник» в чеке (картон и т.п.)</option>
                </select>
              </div>
              <div className="salary-op-field-row">
                <div>
                  <span style={labelSm}>Резка, ₽</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesBacking}
                    value={r.backingCutRatePerUnit}
                    onChange={(e) => patch({ backingCutRatePerUnit: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <span style={labelSm}>Установка, ₽</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesBacking}
                    value={r.backingInstallRatePerUnit}
                    onChange={(e) => patch({ backingInstallRatePerUnit: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="salary-op-field-row">
                <div>
                  <span style={labelSm}>Режим</span>
                  <select
                    className="bo-select"
                    style={{ width: "100%" }}
                    disabled={!r.doesBacking}
                    value={r.backingPayMode}
                    onChange={(e) => patch({ backingPayMode: e.target.value as PayMode })}
                  >
                    <option value="percent">Процент</option>
                    <option value="fixed">Фикс / шт</option>
                  </select>
                </div>
                <div>
                  <span style={labelSm}>Оплата ({modeLabel(r.backingPayMode)})</span>
                  <input
                    className="bo-input"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!r.doesBacking}
                    value={r.backingSharePercent}
                    onChange={(e) => patch({ backingSharePercent: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Паспарту */}
          <div
            style={{
              ...cardBase,
              opacity: r.doesMatCut ? 1 : 0.72,
              borderLeft: r.doesMatCut ? "4px solid var(--bo-accent)" : "4px solid var(--bo-border)",
              gridColumn: "1 / -1"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Резка окна в паспарту (шт)</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <input type="checkbox" checked={r.doesMatCut} onChange={(e) => patch({ doesMatCut: e.target.checked })} />
                В ЗП
              </label>
            </div>
            <div className="salary-op-mat-row">
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={labelSm}>Откуда брать сумму для пула ЗП</span>
                <select
                  className="bo-select"
                  style={{ width: "100%" }}
                  disabled={!r.doesMatCut}
                  value={r.matCutRevenueSource}
                  onChange={(e) => patch({ matCutRevenueSource: e.target.value as MatCutRevenueSource })}
                >
                  <option value="unit_tariff">Тариф × число окон паспарту</option>
                  <option value="order_matboard">Сумма «Паспарту» в чеке заказа</option>
                </select>
              </div>
              <div>
                <span style={labelSm}>Тариф клиента, ₽/шт</span>
                <input
                  className="bo-input"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!r.doesMatCut}
                  value={r.matCutRatePerUnit}
                  onChange={(e) => patch({ matCutRatePerUnit: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <span style={labelSm}>Режим</span>
                <select
                  className="bo-select"
                  style={{ width: "100%" }}
                  disabled={!r.doesMatCut}
                  value={r.matPayMode}
                  onChange={(e) => patch({ matPayMode: e.target.value as PayMode })}
                >
                  <option value="percent">Процент</option>
                  <option value="fixed">Фикс / шт</option>
                </select>
              </div>
              <div>
                <span style={labelSm}>Оплата ({modeLabel(r.matPayMode)})</span>
                <input
                  className="bo-input"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!r.doesMatCut}
                  value={r.matSharePercent}
                  onChange={(e) => patch({ matSharePercent: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SalaryAlgorithmPage() {
  const { user, permissions, loading: permLoading } = useBackofficeSession();
  const permEmpty = !permissions || (typeof permissions === "object" && Object.keys(permissions).length === 0);
  const failOpen = permLoading || permEmpty;
  const can = (k: string) => (failOpen ? true : Boolean(permissions?.[k]));
  const manage = isManageRole(user?.role);

  const [sellerRows, setSellerRows] = useState<SellerRule[]>([]);
  const [masterRows, setMasterRows] = useState<MasterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("sellers");
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);
  const [materialBindOptions, setMaterialBindOptions] = useState<MaterialBindOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sellersRes, mastersRes] = await Promise.all([
          fetch("/api/payroll/sellers", { credentials: "include", cache: "no-store" }),
          fetch("/api/payroll/masters", { credentials: "include", cache: "no-store" })
        ]);
        const sellersData = (await sellersRes.json()) as { ok?: boolean; sellers?: SellerRule[] };
        const mastersData = (await mastersRes.json()) as { ok?: boolean; masters?: MasterRule[] };
        if (!cancelled) {
          setSellerRows(sellersData.ok && Array.isArray(sellersData.sellers) ? sellersData.sellers : []);
          setMasterRows(
            mastersData.ok && Array.isArray(mastersData.masters)
              ? mastersData.masters.map((row) => normalizeMasterRule(row as MasterRule))
              : []
          );
        }
      } catch {
        if (!cancelled) {
          setSellerRows([]);
          setMasterRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/materials", { credentials: "include", cache: "no-store" });
        const raw = (await res.json().catch(() => ({}))) as MaterialsApiResponse;
        const toOpts = (rows: Array<{ id?: string; name?: string }>, kind: "backing", title: string): MaterialBindOption[] => {
          const out: MaterialBindOption[] = [];
          for (const r of rows) {
            const ref = String(r.id ?? "").trim();
            const name = String(r.name ?? "").trim();
            if (!ref) continue;
            out.push({
              value: `order_material:${kind}:${ref}`,
              label: `${title}: ${name || ref}`
            });
          }
          return out;
        };
        const all = toOpts(Array.isArray(raw.backing) ? raw.backing : [], "backing", "Материал холста");
        if (!cancelled) setMaterialBindOptions(all);
      } catch {
        if (!cancelled) setMaterialBindOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (masterRows.length === 0) {
      setSelectedMasterId(null);
      return;
    }
    setSelectedMasterId((prev) => {
      if (prev && masterRows.some((m) => m.userId === prev)) return prev;
      return masterRows[0].userId;
    });
  }, [masterRows]);

  const title = useMemo(() => (manage ? "Алгоритм зарплаты" : "Мой алгоритм зарплаты"), [manage]);

  const selectedMaster = useMemo(
    () => (selectedMasterId ? masterRows.find((m) => m.userId === selectedMasterId) : undefined),
    [masterRows, selectedMasterId]
  );

  async function saveSeller(row: SellerRule) {
    const baseAmount = Math.max(0, Number(row.baseAmount) || 0);
    const percent = Math.max(0, Math.min(100, Number(row.percent) || 0));
    setSavingId(`seller:${row.userId}`);
    try {
      const res = await fetch(`/api/payroll/sellers/${encodeURIComponent(row.userId)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseAmount, percent })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) toast.success("Сохранено");
      else toast.error(data?.message || "Ошибка сохранения");
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSavingId(null);
    }
  }

  async function saveMaster(row: MasterRule) {
    const body = {
      baseAmount: Math.max(0, Number(row.baseAmount) || 0),
      masterSharePercent: Math.max(0, Math.min(100, Number(row.masterSharePercent) || 0)),
      complexityMultiplier: Math.max(0, Number(row.complexityMultiplier) || 0),
      frameAssemblyRatePerMeter: Math.max(0, Number(row.frameAssemblyRatePerMeter) || 0),
      frameAssemblyPayMode: row.frameAssemblyPayMode,
      frameAssemblySharePercent: Math.max(0, Number(row.frameAssemblySharePercent) || 0),
      canvasStretchRatePerM2: Math.max(0, Number(row.canvasStretchRatePerM2) || 0),
      canvasStretchPayMode: row.canvasStretchPayMode,
      canvasStretchSharePercent: Math.max(0, Number(row.canvasStretchSharePercent) || 0),
      glassCutRatePerUnit: Math.max(0, Number(row.glassCutRatePerUnit) || 0),
      glassInstallRatePerUnit: Math.max(0, Number(row.glassInstallRatePerUnit) || 0),
      glassPayMode: row.glassPayMode,
      glassSharePercent: Math.max(0, Number(row.glassSharePercent) || 0),
      backingCutRatePerUnit: Math.max(0, Number(row.backingCutRatePerUnit) || 0),
      backingInstallRatePerUnit: Math.max(0, Number(row.backingInstallRatePerUnit) || 0),
      backingPayMode: row.backingPayMode,
      backingSharePercent: Math.max(0, Number(row.backingSharePercent) || 0),
      matCutRatePerUnit: Math.max(0, Number(row.matCutRatePerUnit) || 0),
      matPayMode: row.matPayMode,
      matSharePercent: Math.max(0, Number(row.matSharePercent) || 0),
      doesFrameAssembly: row.doesFrameAssembly,
      doesCanvasStretch: row.doesCanvasStretch,
      doesGlass: row.doesGlass,
      doesBacking: row.doesBacking,
      doesMatCut: row.doesMatCut,
      frameAssemblyRevenueSource: row.frameAssemblyRevenueSource,
      canvasStretchRevenueSource: row.canvasStretchRevenueSource,
      glassRevenueSource: row.glassRevenueSource,
      backingRevenueSource: row.backingRevenueSource,
      matCutRevenueSource: row.matCutRevenueSource
    };

    setSavingId(`master:${row.userId}`);
    try {
      const res = await fetch(`/api/payroll/masters/${encodeURIComponent(row.userId)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) toast.success("Сохранено");
      else toast.error(data?.message || "Ошибка сохранения");
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSavingId(null);
    }
  }

  if (!can("salary_algorithm")) {
    return (
      <div className="bo-card bo-empty">
        <strong>Нет доступа</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--bo-text-muted)" }}>
          Раздел «Алгоритм расчёта зарплаты» недоступен для вашей роли.
        </p>
      </div>
    );
  }

  const tabBtn = (active: boolean): CSSProperties => ({
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    background: active ? "var(--bo-surface)" : "transparent",
    color: active ? "var(--bo-accent)" : "var(--bo-text-muted)",
    boxShadow: active ? "var(--bo-shadow)" : "none"
  });

  return (
    <>
      {helpOpen ? (
        <SalaryAlgorithmHelpModalDynamic open={helpOpen} onClose={() => setHelpOpen(false)} />
      ) : null}

      <div style={shell}>
        <header className="bo-page-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <h1 className="bo-page-title" style={{ margin: 0 }}>
                  {title}
                </h1>
                <button
                  type="button"
                  className="bo-btn bo-btn-ghost"
                  aria-label="Справка: как считается зарплата"
                  title="Справка"
                  onClick={() => setHelpOpen(true)}
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  Справка
                </button>
              </div>
              <p className="bo-page-subtitle" style={{ maxWidth: 640 }}>
                {mainTab === "sellers"
                  ? "Ставка и процент от продаж магазина по готовым заказам за период."
                  : "Выберите сотрудника слева. Отметьте операции и тарифы — в зарплату попадут только включённые работы."}
              </p>
            </div>
          </div>
        </header>

        <div
          className="bo-card"
          style={{
            padding: 0,
            overflow: "hidden",
            boxShadow: "var(--bo-shadow-lg)",
            borderRadius: "var(--bo-radius)",
            minWidth: 0
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              background: "var(--bo-surface-elevated)",
              borderBottom: "1px solid var(--bo-border)"
            }}
          >
            <div
              role="tablist"
              aria-label="Разделы настройки"
              style={{
                display: "inline-flex",
                gap: 4,
                padding: 4,
                borderRadius: 12,
                background: "var(--bo-border)",
                backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.03), transparent)"
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === "sellers"}
                style={tabBtn(mainTab === "sellers")}
                onClick={() => setMainTab("sellers")}
              >
                Продавцы
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === "masters"}
                style={tabBtn(mainTab === "masters")}
                onClick={() => setMainTab("masters")}
              >
                Мастер и цех
              </button>
            </div>
          </div>

          <div style={{ padding: "20px 22px 28px", minHeight: 320, minWidth: 0 }}>
            {loading ? (
              <BoInlineTableSkeleton rows={8} />
            ) : mainTab === "sellers" ? (
              sellerRows.length === 0 ? (
                <div className="bo-empty">Нет продавцов для настройки.</div>
              ) : (
                <div
                  className="salary-seller-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
                    gap: 16
                  }}
                >
                  {sellerRows.map((r) => (
                    <div
                      key={r.userId}
                      className="salary-seller-card"
                      style={{
                        border: "1px solid var(--bo-border)",
                        borderRadius: "var(--bo-radius-sm)",
                        padding: "18px 20px 20px",
                        background: "var(--bo-surface)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                        boxShadow: "var(--bo-shadow)",
                        minWidth: 0
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{r.name || r.email}</div>
                        <div style={{ fontSize: 13, color: "var(--bo-text-muted)", marginTop: 4 }}>{r.email}</div>
                        <div
                          style={{
                            marginTop: 10,
                            fontSize: 13,
                            color: "var(--bo-text-muted)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6
                          }}
                        >
                          <span style={{ opacity: 0.7 }}>Магазин</span>
                          <span style={{ fontWeight: 600, color: "var(--bo-text)" }}>{r.storeName || "—"}</span>
                        </div>
                      </div>
                      <div className="salary-seller-fields">
                        <label>
                          <span style={labelSm}>Ставка, ₽</span>
                          <input
                            className="bo-input"
                            type="number"
                            min={0}
                            step="0.01"
                            value={r.baseAmount}
                            onChange={(e) =>
                              setSellerRows((prev) =>
                                prev.map((x) => (x.userId === r.userId ? { ...x, baseAmount: Number(e.target.value) || 0 } : x))
                              )
                            }
                          />
                        </label>
                        <label>
                          <span style={labelSm}>Процент, %</span>
                          <input
                            className="bo-input"
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={r.percent}
                            onChange={(e) =>
                              setSellerRows((prev) =>
                                prev.map((x) => (x.userId === r.userId ? { ...x, percent: Number(e.target.value) || 0 } : x))
                              )
                            }
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="bo-btn bo-btn-primary"
                        style={{ width: "100%", marginTop: "auto" }}
                        onClick={() => void saveSeller(r)}
                        disabled={savingId === `seller:${r.userId}`}
                      >
                        {savingId === `seller:${r.userId}` ? "Сохранение…" : "Сохранить"}
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : masterRows.length === 0 ? (
              <div className="bo-empty">Нет мастеров/цеха для настройки.</div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  margin: "-4px -6px 0"
                }}
              >
                <div className="salary-master-layout">
                  <aside className="salary-master-sidebar" aria-label="Список мастеров и цеха">
                    {masterRows.map((m) => {
                      const sel = m.userId === selectedMasterId;
                      const n = masterActiveOpsCount(m);
                      return (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() => setSelectedMasterId(m.userId)}
                          style={{
                            textAlign: "left",
                            padding: "12px 14px",
                            borderRadius: "var(--bo-radius-sm)",
                            border: sel ? "2px solid var(--bo-accent)" : "1px solid var(--bo-border)",
                            background: sel ? "var(--bo-accent-soft)" : "var(--bo-surface)",
                            cursor: "pointer",
                            font: "inherit",
                            color: "inherit",
                            boxShadow: sel ? "var(--bo-shadow)" : "none",
                            transition: "border-color 0.15s, background 0.15s"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: "var(--bo-accent-soft-strong)",
                                color: "var(--bo-accent-hover)",
                                fontWeight: 800,
                                fontSize: 13,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0
                              }}
                            >
                              {masterInitials(m.name, m.email)}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{m.name || m.email}</div>
                              <div style={{ fontSize: 12, color: "var(--bo-text-muted)", marginTop: 2 }}>{n}/5 операций</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </aside>

                  <div style={{ minWidth: 0, padding: "0 6px" }} className="salary-master-main">
                    <div className="salary-master-select-mobile" style={{ marginBottom: 16, maxWidth: 480 }}>
                      <span style={{ ...labelSm, display: "block", marginBottom: 8 }}>Сотрудник</span>
                      <select
                        className="bo-select"
                        style={{ width: "100%" }}
                        value={selectedMasterId ?? ""}
                        onChange={(e) => setSelectedMasterId(e.target.value || null)}
                        aria-label="Выбор мастера или цеха"
                      >
                      {masterRows.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name || m.email} ({masterActiveOpsCount(m)}/5 оп.)
                        </option>
                      ))}
                      </select>
                    </div>

                    {selectedMaster ? (
                      <MasterEditor
                        r={selectedMaster}
                        patch={(partial) =>
                          setMasterRows((p) => p.map((x) => (x.userId === selectedMaster.userId ? { ...x, ...partial } : x)))
                        }
                        onSave={(row) => void saveMaster(row)}
                        saving={savingId === `master:${selectedMaster.userId}`}
                        materialBindOptions={materialBindOptions}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
