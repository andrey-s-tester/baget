"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ShowcaseProductItem = { id: string; title: string; artist?: string };

type Props = {
  value: string;
  onChange: (productId: string) => void;
  products: ShowcaseProductItem[];
  disabled?: boolean;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

export function WarehouseShowcasePicker({ value, onChange, products, disabled }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const pool = useMemo(() => products.filter((p) => p.id.length > 0), [products]);

  const q = norm(value);
  const suggestions = useMemo(() => {
    if (!q) return pool.slice(0, 80);
    return pool
      .filter((row) => {
        const id = norm(row.id);
        const title = norm(row.title);
        const artist = norm(row.artist ?? "");
        return id.includes(q) || title.includes(q) || artist.includes(q) || q.includes(id);
      })
      .slice(0, 80);
  }, [pool, q]);

  const exactMatch = useMemo(() => {
    const t = value.trim();
    if (!t) return false;
    return pool.some((row) => row.id === t);
  }, [pool, value]);

  useLayoutEffect(() => {
    if (!open || disabled || !rootRef.current) {
      setDropdownPos(null);
      return;
    }
    const el = rootRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, disabled]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 200 }}>
      <input
        className="bo-input"
        style={{ width: "100%", boxSizing: "border-box" }}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="ID, название или художник…"
        autoComplete="off"
      />
      {open && !disabled && dropdownPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              className="bo-card"
              style={{
                position: "fixed",
                left: dropdownPos.left,
                top: dropdownPos.top,
                width: Math.max(280, dropdownPos.width),
                zIndex: 11000,
                maxHeight: "min(280px, 45vh)",
                overflow: "auto",
                padding: 0,
                boxShadow: "var(--bo-shadow-lg)",
              }}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 4 }}>
                {suggestions.length === 0 ? (
                  <li style={{ padding: "10px 12px", fontSize: 13, color: "var(--bo-text-muted)" }}>
                    {q ? "Нет совпадений в каталоге товаров" : "Начните ввод или выберите из списка"}
                  </li>
                ) : (
                  suggestions.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(row.id);
                          setOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 13,
                          borderRadius: "var(--bo-radius-sm)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                      >
                        <strong>{row.title}</strong>
                        <span style={{ color: "var(--bo-text-muted)", marginLeft: 8 }}>
                          {row.artist ? `${row.artist} · ` : ""}
                          <code style={{ fontSize: 12 }}>{row.id}</code>
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body
          )
        : null}
      {!disabled && value.trim() && !exactMatch ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "var(--bo-text-muted)",
          }}
        >
          Выберите позицию из списка или введите точный id товара.
        </div>
      ) : null}
    </div>
  );
}
