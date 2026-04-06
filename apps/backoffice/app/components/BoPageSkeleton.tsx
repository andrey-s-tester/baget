"use client";

import type { CSSProperties } from "react";

const pulse: CSSProperties = {
  borderRadius: 8,
  background: "linear-gradient(90deg, #e2e8e4 0%, #f1f5f3 45%, #e2e8e4 90%)",
  backgroundSize: "200% 100%",
  animation: "bo-skeleton-shimmer 1.2s ease-in-out infinite"
};

/** Дашборд и похожие страницы со статистикой */
export function BoStatsPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <>
      <div className="bo-page-header">
        <div style={{ ...pulse, height: 28, width: "42%", maxWidth: 280, marginBottom: 10 }} />
        <div style={{ ...pulse, height: 16, width: "58%", maxWidth: 400 }} />
      </div>
      <div className="bo-stats-grid" style={{ marginBottom: 28 }}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bo-stat-card" style={{ borderLeftColor: "var(--bo-border)" }}>
            <div style={{ ...pulse, height: 12, width: "55%", marginBottom: 10 }} />
            <div style={{ ...pulse, height: 28, width: "72%" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <div className="bo-card" style={{ padding: 20 }}>
          <div style={{ ...pulse, height: 18, width: 140, marginBottom: 16 }} />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ ...pulse, height: 14, width: i % 2 ? "88%" : "92%", marginBottom: 12 }} />
          ))}
        </div>
        <div className="bo-card" style={{ padding: 20 }}>
          <div style={{ ...pulse, height: 18, width: 160, marginBottom: 16 }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ ...pulse, height: 14, width: `${70 + i * 5}%`, marginBottom: 12 }} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Списки / таблицы */
export function BoTablePageSkeleton({
  titleWidth = 200,
  omitPageHeader = false
}: {
  titleWidth?: number;
  /** Когда шапка страницы уже отрисована (вкладки, фильтры) */
  omitPageHeader?: boolean;
}) {
  return (
    <>
      {!omitPageHeader ? (
        <div className="bo-page-header">
          <div style={{ ...pulse, height: 28, width: titleWidth, marginBottom: 10 }} />
          <div style={{ ...pulse, height: 14, width: "70%", maxWidth: 420 }} />
        </div>
      ) : null}
      <div className="bo-card" style={{ padding: 0 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--bo-border)" }}>
          <div style={{ ...pulse, height: 12, width: "30%" }} />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: "14px 16px",
              borderBottom: i < 7 ? "1px solid var(--bo-border)" : undefined,
              display: "flex",
              gap: 16,
              alignItems: "center"
            }}
          >
            <div style={{ ...pulse, height: 14, flex: 1 }} />
            <div style={{ ...pulse, height: 14, width: 80 }} />
            <div style={{ ...pulse, height: 14, width: 100 }} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Сетка карточек каталога */
export function BoCatalogGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="bo-grid-cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bo-card bo-catalog-card" style={{ minHeight: 200 }}>
          <div style={{ ...pulse, height: 90, width: "100%", marginBottom: 12 }} />
          <div style={{ ...pulse, height: 14, width: "70%", marginBottom: 8 }} />
          <div style={{ ...pulse, height: 12, width: "45%" }} />
        </div>
      ))}
    </div>
  );
}

/** Таблица внутри карточки (без шапки страницы) */
export function BoInlineTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{ padding: "8px 4px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            ...pulse,
            height: 14,
            width: `${92 - (i % 4) * 5}%`,
            marginBottom: 12,
            marginLeft: 8,
            marginRight: 8
          }}
        />
      ))}
    </div>
  );
}

/** Склад: две колонки (документы + редактор), без дублирования шапки страницы */
export function BoWarehouseSkeleton() {
  const col = (
    <div className="bo-card" style={{ padding: 0, minHeight: 360, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--bo-border)" }}>
        <div style={{ ...pulse, height: 14, width: "40%" }} />
      </div>
      <div style={{ padding: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ ...pulse, height: 12, width: `${92 - (i % 4) * 6}%`, marginBottom: 10 }} />
        ))}
      </div>
    </div>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) minmax(420px, 1.5fr)",
        gap: 24,
        alignItems: "start"
      }}
    >
      {col}
      {col}
    </div>
  );
}

/** Минимальный блок (карточка с контентом) */
export function BoCardPageSkeleton() {
  return (
    <>
      <div className="bo-page-header">
        <div style={{ ...pulse, height: 28, width: 220, marginBottom: 10 }} />
        <div style={{ ...pulse, height: 14, width: "65%", maxWidth: 400 }} />
      </div>
      <div className="bo-card" style={{ padding: 24 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ ...pulse, height: 16, width: `${85 - (i % 3) * 8}%`, marginBottom: 14 }} />
        ))}
      </div>
    </>
  );
}
