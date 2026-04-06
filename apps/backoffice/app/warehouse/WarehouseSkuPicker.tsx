"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FrameInvItem = { sku: string; name: string; category: string };
export type MatInvItem = { sku: string; name: string };
export type AccessoryGroupInv =
  | "hanger"
  | "subframe"
  | "assembly_product"
  | "fit_type"
  | "stand_leg"
  | "finishing";

export type AccessoryInvItem = { code: string; name: string; group: AccessoryGroupInv };

type FrameCategory = "plastic" | "wood" | "aluminum" | "";

type Props = {
  kind: "frame" | "matboard" | "accessory" | "glass" | "backing";
  value: string;
  onChange: (sku: string) => void;
  frames: FrameInvItem[];
  matboards: MatInvItem[];
  glassItems: MatInvItem[];
  backingItems: MatInvItem[];
  accessories: AccessoryInvItem[];
  accessoryGroup?: AccessoryGroupInv;
  disabled?: boolean;
  /** Если артикула нет в каталоге — кнопка в подсказке */
  onCreateNew?: (sku: string) => void;
};

const CAT_LABEL: Record<string, string> = {
  plastic: "Пластик",
  wood: "Дерево",
  aluminum: "Алюминий",
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

export function WarehouseSkuPicker({
  kind,
  value,
  onChange,
  frames,
  matboards,
  glassItems,
  backingItems,
  accessories,
  accessoryGroup,
  disabled,
  onCreateNew,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [catFilter, setCatFilter] = useState<FrameCategory>("");

  const pool = useMemo(() => {
    if (kind === "frame") {
      let list = frames;
      if (catFilter) list = list.filter((f) => f.category === catFilter);
      return list;
    }
    if (kind === "accessory") {
      return accessories
        .filter((a) => !accessoryGroup || a.group === accessoryGroup)
        .map((a) => ({ sku: a.code, name: a.name }));
    }
    if (kind === "glass") return glassItems;
    if (kind === "backing") return backingItems;
    return matboards;
  }, [kind, frames, matboards, glassItems, backingItems, accessories, accessoryGroup, catFilter]);

  const q = norm(value);
  const suggestions = useMemo(() => {
    if (!q) return pool.slice(0, 80);
    return pool
      .filter((row) => {
        const sku = norm(row.sku);
        const name = norm(row.name);
        return sku.includes(q) || name.includes(q) || q.includes(sku);
      })
      .slice(0, 80);
  }, [pool, q]);

  const exactMatch = useMemo(() => {
    const t = value.trim();
    if (!t) return false;
    return pool.some((row) => row.sku === t);
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

  useEffect(() => {
    if (kind === "matboard" || kind === "glass" || kind === "backing") setCatFilter("");
  }, [kind]);

  const showCreateHint = Boolean(value.trim()) && !exactMatch && open;

  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 200 }}>
      <input
        className="bo-input"
        style={{ width: "100%", boxSizing: "border-box" }}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={kind === "frame" ? "Артикул или название…" : "Артикул или название…"}
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
              {kind === "frame" ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--bo-border)",
                    background: "#f8fafc",
                  }}
                >
                  {(["", "plastic", "wood", "aluminum"] as FrameCategory[]).map((c) => (
                    <button
                      key={c || "all"}
                      type="button"
                      className="bo-btn"
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        background: catFilter === c ? "var(--bo-accent)" : "var(--bo-surface)",
                        color: catFilter === c ? "#fff" : "var(--bo-text)",
                        border: "1px solid var(--bo-border)",
                      }}
                      onClick={() => setCatFilter(c)}
                    >
                      {c === "" ? "Все" : CAT_LABEL[c] ?? c}
                    </button>
                  ))}
                </div>
              ) : null}
              {kind === "accessory" && accessoryGroup ? (
                <div
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--bo-border)",
                    fontSize: 12,
                    color: "var(--bo-text-muted)",
                    background: "#f8fafc",
                  }}
                >
                  Показаны позиции выбранного вида фурнитуры (как в «Материалах»).
                </div>
              ) : null}
              <ul style={{ listStyle: "none", margin: 0, padding: 4 }}>
                {suggestions.length === 0 ? (
                  <li style={{ padding: "10px 12px", fontSize: 13, color: "var(--bo-text-muted)" }}>
                    {q
                      ? "Нет совпадений в каталоге"
                      : kind === "accessory"
                        ? "Начните ввод или смените вид строки слева"
                        : "Начните ввод или выберите категорию (багет)"}
                  </li>
                ) : (
                  suggestions.map((row) => (
                    <li key={row.sku}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(row.sku);
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
                        <strong>{row.sku}</strong>
                        <span style={{ color: "var(--bo-text-muted)", marginLeft: 8 }}>
                          {row.name}
                          {kind === "frame"
                            ? ` · ${CAT_LABEL[(row as FrameInvItem).category] ?? (row as FrameInvItem).category}`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {showCreateHint && onCreateNew ? (
                <div style={{ padding: "10px 10px 12px", borderTop: "1px solid var(--bo-border)" }}>
                  <button
                    type="button"
                    className="bo-btn bo-btn-primary"
                    style={{ width: "100%", fontSize: 13 }}
                    onClick={() => {
                      onCreateNew(value.trim());
                      setOpen(false);
                    }}
                  >
                    Создать «{value.trim()}» в каталоге…
                  </button>
                </div>
              ) : showCreateHint ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderTop: "1px dashed var(--bo-border)",
                    fontSize: 12,
                    color: "var(--bo-text-muted)",
                  }}
                >
                  Нет позиции с таким артикулом — откройте список и используйте кнопку создания, если она доступна.
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
      {!disabled && value.trim() && !exactMatch && onCreateNew ? (
        <button
          type="button"
          className="bo-btn bo-btn-secondary"
          style={{ marginTop: 6, fontSize: 12, padding: "6px 10px", width: "100%" }}
          onClick={() => onCreateNew(value.trim())}
        >
          + Создать «{value.trim()}» в каталоге
        </button>
      ) : null}
    </div>
  );
}
