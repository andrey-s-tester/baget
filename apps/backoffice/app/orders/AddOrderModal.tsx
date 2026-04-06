"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import {
  accessoryPriceForLine,
  openingPerimeterMeters,
  type AccessoryPriceUnitClient,
  type PriceBreakdown
} from "@yanak/types";
import {
  accessoryCatalogFromMaterialsResponse,
  getOrderOuterDimensionsMm,
  printOrderReceipt,
  type OrderReceiptInput
} from "@yanak/receipt";
import { FrameCatalogChainImg } from "../components/FrameCatalogChainImg";

type PricingRules = {
  frameWasteCoeff: number;
  assemblyPrice: number;
  minimalOrderPrice: number;
  matboardPricePerM2: number;
  glassPrices: { id: string; name: string; price: number }[];
  backingPrices: { id: string; name: string; price: number }[];
};

type AccExtra = { id: string; name: string; price: number; stockQty?: number; priceUnit?: string };

type MaterialsData = {
  matboard: { pricePerM2: number };
  glass: { id: string; name: string; pricePerM2: number }[];
  backing: { id: string; name: string; pricePerM2: number | null }[];
  hangers?: AccExtra[];
  subframes?: AccExtra[];
  assemblyProducts?: AccExtra[];
  standLegs?: AccExtra[];
  finishings?: AccExtra[];
};

function accUnit(u: string | undefined): AccessoryPriceUnitClient {
  return u === "linear_meter" ? "linear_meter" : "piece";
}

function lineAccPrice(list: AccExtra[] | undefined, id: string, perimeterM: number) {
  const h = list?.find((x) => x.id === id);
  if (!h) return 0;
  return accessoryPriceForLine(h.price, accUnit(h.priceUnit), perimeterM);
}

function accOptionLabel(h: AccExtra, perimeterM: number) {
  if (accUnit(h.priceUnit) === "linear_meter") {
    const est = accessoryPriceForLine(h.price, "linear_meter", perimeterM);
    return `${h.name} (${Number(h.price).toLocaleString("ru-RU")} руб./п.м. · ~${est.toLocaleString("ru-RU")} руб.)`;
  }
  return `${h.name} (${Number(h.price).toLocaleString("ru-RU")} руб./шт.)`;
}

type FrameCategory = "plastic" | "wood" | "aluminum";

const FRAME_CATEGORY_LABELS: Record<FrameCategory, string> = {
  wood: "Дерево",
  plastic: "Пластик",
  aluminum: "Алюминий",
};

type CatalogFrame = {
  sku: string;
  name: string;
  category?: FrameCategory;
  retailPriceMeter: number;
  widthMm?: number;
  imageUrl?: string;
  previewImageUrl?: string;
  isActive?: boolean;
  stockMeters?: number;
  minStockMeters?: number | null;
};

type CatalogMatboard = { sku: string; name: string; pricePerM2: number; imageUrl?: string };
type Store = { id: string; name: string };
type Customer = { id: string; name: string; phone: string; email?: string; orderIds: string[] };

type Props = {
  onClose: () => void;
  /** Вызывается после успешного создания (например, тихая подгрузка списка заказов). */
  onCreated: () => void;
  /** Переход к истории заказов — только по кнопке в уведомлении. */
  onGoToHistory?: () => void;
  mode?: "modal" | "inline";
};

const FETCH_OPTS: RequestInit = { cache: "no-store" };

function mapInventoryFrameRow(row: Record<string, unknown>): CatalogFrame {
  const r = row as CatalogFrame;
  return {
    ...r,
    category: (r.category as FrameCategory | undefined) ?? undefined,
    stockMeters: Number(r.stockMeters) || 0,
    minStockMeters: r.minStockMeters == null ? null : Number(r.minStockMeters),
    isActive: r.isActive !== false,
  };
}

function BaguetteSkuCombobox({
  value,
  onPick,
  pool,
  onSearchQuery,
  disabled,
  placeholder = "Начните вводить артикул или название",
}: {
  value: string;
  onPick: (sku: string, frame: CatalogFrame | undefined) => void;
  pool: CatalogFrame[];
  onSearchQuery: (q: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const selected = useMemo(() => pool.find((f) => f.sku === value), [pool, value]);

  const displayClosed = useMemo(() => {
    if (selected) {
      return `${selected.sku} — ${selected.retailPriceMeter.toLocaleString("ru-RU")} руб./м — ${Number(
        selected.stockMeters ?? 0
      ).toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м`;
    }
    return value ? value : "";
  }, [selected, value]);

  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (q.length < 2) return;
    const h = window.setTimeout(() => onSearchQuery(q), 320);
    return () => window.clearTimeout(h);
  }, [text, open, onSearchQuery]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = q
      ? pool.filter(
          (f) => f.sku.toLowerCase().includes(q) || (f.name && f.name.toLowerCase().includes(q))
        )
      : pool;
    return list.slice(0, 220);
  }, [pool, text]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <input
        type="text"
        className="bo-input"
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        readOnly={!open}
        value={open ? text : displayClosed}
        onFocus={() => {
          setOpen(true);
          setText(selected ? selected.sku : "");
        }}
        onChange={(e) => {
          if (open) setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        style={{ width: "100%" }}
      />
      {open && !disabled ? (
        <div
          className="bo-card"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 50,
            maxHeight: 280,
            overflowY: "auto",
            padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            border: "1px solid var(--bo-border, #e2e8f0)",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: "var(--bo-text-muted)" }}>
              Нет совпадений — введите ≥2 символа для запроса к каталогу
            </div>
          ) : (
            filtered.map((f) => (
              <button
                key={f.sku}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(f.sku, f);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: 13,
                  border: "none",
                  background: f.sku === value ? "rgba(13,148,136,0.12)" : "transparent",
                  cursor: "pointer",
                  borderRadius: 6,
                }}
              >
                <strong>{f.sku}</strong> — {f.retailPriceMeter.toLocaleString("ru-RU")} руб./м —{" "}
                {Number(f.stockMeters ?? 0).toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м
                {f.name ? (
                  <span style={{ display: "block", fontSize: 12, color: "var(--bo-text-muted)", marginTop: 2 }}>
                    {f.name}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const PHONE_373_DIGITS = "373";
const PHONE_LOCAL_MAX_DIGITS = 9;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function maskPhone373(input: string) {
  const digits = digitsOnly(input);
  if (!digits) return "";

  const local = digits.startsWith(PHONE_373_DIGITS) ? digits.slice(PHONE_373_DIGITS.length) : digits;
  const localTrimmed = local.slice(0, PHONE_LOCAL_MAX_DIGITS);

  return `+${PHONE_373_DIGITS}${localTrimmed}`;
}

export function AddOrderModal({ onClose, onCreated, onGoToHistory, mode = "modal" }: Props) {
  const [rules, setRules] = useState<PricingRules | null>(null);
  const [materials, setMaterials] = useState<MaterialsData | null>(null);
  const [frames, setFrames] = useState<CatalogFrame[]>([]);
  const [matboards, setMatboards] = useState<CatalogMatboard[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  const [widthMm, setWidthMm] = useState(304);
  const [heightMm, setHeightMm] = useState(600);
  const [selectedSku, setSelectedSku] = useState("");
  const [framePricePerMeter, setFramePricePerMeter] = useState(10056);
  const [frameProfileWidthMm, setFrameProfileWidthMm] = useState(40);
  const [frameLayers, setFrameLayers] = useState<{ sku: string }[]>([]);
  const [glassId, setGlassId] = useState("regular");
  const [backingId, setBackingId] = useState("cardboard");
  const [matboardLayers, setMatboardLayers] = useState<{ sku: string; marginMm: number }[]>([]);
  const [hangerId, setHangerId] = useState("");
  const [subframeId, setSubframeId] = useState("");
  const [finishingId, setFinishingId] = useState("");
  const [assemblyProductId, setAssemblyProductId] = useState("");
  const [standLegId, setStandLegId] = useState("");

  const [result, setResult] = useState<PriceBreakdown | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [store, setStore] = useState("");
  const [comment, setComment] = useState("");
  const [frameQuantity, setFrameQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [customerLookup, setCustomerLookup] = useState<Customer | null>(null);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const matboardSkuSelectRef = useRef<HTMLSelectElement | null>(null);
  /** Отбрасываем ответы /api/pricing/calculate, если уже запущен более новый расчёт (иначе «Итого» залипает). */
  const calcSeqRef = useRef(0);

  const [catalogPicker, setCatalogPicker] = useState<
    null | { kind: "frame" | "matboard"; layerIndex: number }
  >(null);
  const [framePickerCategory, setFramePickerCategory] = useState<"" | FrameCategory>("");
  const [framePickerSort, setFramePickerSort] = useState<"stock_desc" | "stock_asc" | "sku">("stock_desc");
  const [framePickerSearch, setFramePickerSearch] = useState("");
  /** Позиции, подтянутые с сервера по `q` (нет в первых limit строках полного списка). */
  const [frameRemoteList, setFrameRemoteList] = useState<CatalogFrame[]>([]);

  /** Паспарту: один URL; strict — при 404 не подменяем SVG-«успех», чтобы не блокировать диагностику. */
  function toBackofficeImageSrc(src: string | undefined, sku: string): string {
    const cleanSrc = src?.trim() || "";
    if (!cleanSrc) return `/baget-assets/${sku}.jpg`;
    if (!cleanSrc.startsWith("http")) return cleanSrc;
    return `/api/image-proxy?url=${encodeURIComponent(cleanSrc)}&strict=1`;
  }

  const [loading, setLoading] = useState(true);

  const activeFrames = useMemo(
    () => frames.filter((f) => f.isActive !== false),
    [frames]
  );

  const framesPool = useMemo(() => {
    const m = new Map<string, CatalogFrame>();
    for (const f of activeFrames) m.set(f.sku, f);
    for (const f of frameRemoteList) m.set(f.sku, f);
    return [...m.values()];
  }, [activeFrames, frameRemoteList]);

  const requestFrameSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    fetch(`/api/catalog/inventory/frames?q=${encodeURIComponent(trimmed)}&limit=200`, FETCH_OPTS)
      .then((r) => r.json())
      .then((raw: unknown) => {
        const arr = Array.isArray(raw) ? raw : [];
        const rows = (arr as Record<string, unknown>[]).map((row) => mapInventoryFrameRow(row));
        setFrameRemoteList((prev) => {
          const map = new Map(prev.map((f) => [f.sku, f]));
          for (const f of rows) map.set(f.sku, f);
          return [...map.values()];
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = framePickerSearch.trim();
    if (q.length < 2) return;
    const t = window.setTimeout(() => requestFrameSearch(q), 320);
    return () => window.clearTimeout(t);
  }, [framePickerSearch, requestFrameSearch]);

  const ensureFrameInMainState = useCallback((f: CatalogFrame) => {
    setFrames((prev) => (prev.some((x) => x.sku === f.sku) ? prev : [...prev, f]));
  }, []);

  const framePickerItems = useMemo(() => {
    let list = framesPool;
    const q = framePickerSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) => f.sku.toLowerCase().includes(q) || (f.name && f.name.toLowerCase().includes(q))
      );
    } else if (framePickerCategory) {
      list = list.filter((f) => f.category === framePickerCategory);
    }
    const sorted = [...list];
    if (framePickerSort === "stock_desc") {
      sorted.sort(
        (a, b) =>
          (Number(b.stockMeters) || 0) - (Number(a.stockMeters) || 0) || a.sku.localeCompare(b.sku)
      );
    } else if (framePickerSort === "stock_asc") {
      sorted.sort(
        (a, b) =>
          (Number(a.stockMeters) || 0) - (Number(b.stockMeters) || 0) || a.sku.localeCompare(b.sku)
      );
    } else {
      sorted.sort((a, b) => a.sku.localeCompare(b.sku));
    }
    return sorted;
  }, [framesPool, framePickerCategory, framePickerSort, framePickerSearch]);

  useEffect(() => {
    Promise.all([
      fetch("/api/pricing", FETCH_OPTS).then((r) => r.json()),
      fetch("/api/materials", FETCH_OPTS).then((r) => r.json()),
      fetch("/api/catalog/inventory/frames?limit=2000", FETCH_OPTS).then((r) => r.json()),
      fetch("/api/stores", FETCH_OPTS).then((r) => r.json()),
      fetch("/api/catalog/matboard?limit=200", FETCH_OPTS).then((r) => (r.ok ? r.json() : []))
    ]).then(([pricing, materialsData, catalog, storesList, matboardList]) => {
      setRules(pricing);
      setMaterials(materialsData && typeof materialsData === "object" ? materialsData : null);
      const raw = Array.isArray(catalog) ? catalog : [];
      const framesList = (raw as Record<string, unknown>[]).map((row) => mapInventoryFrameRow(row));
      setFrames(framesList);
      setStores(Array.isArray(storesList) ? storesList : []);
      const mbList = Array.isArray(matboardList) ? (matboardList as CatalogMatboard[]) : [];
      setMatboards(mbList);
      const firstMb = mbList[0];
      if (firstMb && typeof firstMb.sku === "string") {
        setMatboardLayers((prev) =>
          prev.length === 0
            ? prev
            : prev.map((l) => (l.sku && mbList.some((m) => m.sku === l.sku) ? l : { ...l, sku: firstMb.sku }))
        );
      }
      const activeList = framesList.filter((f) => f.isActive !== false);
      if (activeList.length > 0) {
        const first = activeList[0]!;
        setSelectedSku(first.sku);
        setFramePricePerMeter(first.retailPriceMeter ?? 10056);
        setFrameProfileWidthMm(Number(first.widthMm ?? 40) || 40);
        setFrameLayers((prev) => (prev.length > 0 ? prev : [{ sku: first.sku }]));
      }
      if (Array.isArray(storesList) && storesList.length > 0) {
        setStore((storesList[0] as Store).name);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeFrames.length > 0) {
      const f = activeFrames.find((x) => x.sku === selectedSku);
      if (f) {
        setFramePricePerMeter(f.retailPriceMeter);
        setFrameProfileWidthMm(Number(f.widthMm ?? 40) || 40);
        setFrameLayers((prev) => {
          if (prev.length === 0) return [{ sku: f.sku }];
          const next = [...prev];
          next[0] = { sku: f.sku };
          return next;
        });
      }
    }
  }, [selectedSku, activeFrames]);

  const glassList = materials?.glass?.length ? materials.glass : rules?.glassPrices ?? [];
  const backingList = materials?.backing?.length ? materials.backing : rules?.backingPrices ?? [];
  useEffect(() => {
    if (glassList.length > 0 && !glassList.some((g) => g.id === glassId)) {
      setGlassId(glassList[0]!.id);
    }
  }, [glassList, glassId]);
  useEffect(() => {
    if (backingList.length > 0 && !backingList.some((b) => b.id === backingId)) {
      setBackingId(backingList[0]!.id);
    }
  }, [backingList, backingId]);

  const runCalc = useCallback(async () => {
    if (!rules) return;
    const seq = ++calcSeqRef.current;
    const glassPrice =
      materials?.glass?.find((g) => g.id === glassId)?.pricePerM2 ??
      rules.glassPrices.find((g) => g.id === glassId)?.price ??
      2000;
    const backingPrice =
      materials?.backing?.find((b) => b.id === backingId)?.pricePerM2 ??
      rules.backingPrices.find((b) => b.id === backingId)?.price ??
      875;
    const layersForCalc =
      matboardLayers.length > 0
        ? matboardLayers
            .filter((l) => l.sku)
            .map((l) => ({
              marginMm: Math.max(0, l.marginMm),
              pricePerM2:
                matboards.find((m) => m.sku === l.sku)?.pricePerM2 ??
                materials?.matboard?.pricePerM2 ??
                rules.matboardPricePerM2 ??
                14552
            }))
        : [];
    const frameLayersForCalc = frameLayers
      .filter((l) => l.sku)
      .map((l) => {
        const frame = frames.find((f) => f.sku === l.sku);
        return {
          profileWidthMm: Number(frame?.widthMm ?? 40) || 40,
          pricePerMeter: Number(frame?.retailPriceMeter ?? 0) || 0,
          wasteCoeff: rules.frameWasteCoeff
        };
      });

    const payload = {
      widthMm,
      heightMm,
      ...(frameLayersForCalc.length > 0 ? { frameLayers: frameLayersForCalc } : {}),
      ...(layersForCalc.length > 0
        ? { matboardLayers: layersForCalc }
        : { matboardMarginMm: 0, matboardPricePerM2: 0 }),
      framePricePerMeter,
      frameWasteCoeff: rules.frameWasteCoeff,
      frameProfileWidthMm,
      glassPricePerM2: glassPrice ?? 0,
      backingPricePerM2: backingPrice ?? 0,
      assemblyPrice: rules.assemblyPrice,
      minimalOrderPrice: rules.minimalOrderPrice
    };
    try {
      const res = await fetch("/api/pricing/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return;
      if (seq !== calcSeqRef.current) return;
      const r = (await res.json()) as Partial<PriceBreakdown> | null;
      const total = toNumber(r?.total, NaN);
      if (seq !== calcSeqRef.current) return;
      if (r && Number.isFinite(total)) {
        setResult({
          frame: toNumber(r.frame),
          matboard: toNumber(r.matboard),
          glass: toNumber(r.glass),
          backing: toNumber(r.backing),
          assembly: toNumber(r.assembly),
          rush: toNumber(r.rush),
          discount: toNumber(r.discount),
          total
        });
      }
    } catch {
      // keep previous result on transient calculation errors
    }
  }, [
    rules,
    materials,
    matboards,
    matboardLayers,
    frameLayers,
    frames,
    selectedSku,
    widthMm,
    heightMm,
    framePricePerMeter,
    frameProfileWidthMm,
    glassId,
    backingId
  ]);

  const withMatboardLayers = matboardLayers.length > 0;
  const openingPerimeterM = useMemo(
    () =>
      openingPerimeterMeters({
        widthMm,
        heightMm,
        matboardLayers: matboardLayers.map((l) => ({ marginMm: l.marginMm })),
        withMatboard: withMatboardLayers,
        useMatboard: withMatboardLayers,
        matboardWidthMm: matboardLayers[0]?.marginMm ?? 0
      }),
    [widthMm, heightMm, matboardLayers, withMatboardLayers]
  );

  function applyMatboardLayerCount(count: number) {
    if (count === 0) {
      setMatboardLayers([]);
      return;
    }
    const firstSku = matboards[0]?.sku ?? "";
    setMatboardLayers((prev) => {
      const next: { sku: string; marginMm: number }[] = [];
      for (let i = 0; i < count; i++) {
        const existing = prev[i];
        next.push({
          sku: existing?.sku || firstSku,
          marginMm: Number.isFinite(existing?.marginMm) ? existing!.marginMm : 40
        });
      }
      return next;
    });
  }

  function applyFrameLayerCount(count: number) {
    if (count <= 0) {
      setFrameLayers([]);
      return;
    }
    const firstSku = frames[0]?.sku ?? selectedSku ?? "";
    setFrameLayers((prev) => {
      const next: { sku: string }[] = [];
      for (let i = 0; i < count; i++) {
        next.push({ sku: prev[i]?.sku || (i === 0 ? selectedSku || firstSku : firstSku) });
      }
      return next;
    });
  }

  function openMatboardCatalogForLayer(layerIndex: number) {
    const needed = Math.min(3, Math.max(1, layerIndex + 1));
    if (matboardLayers.length < needed) applyMatboardLayerCount(needed);
    setCatalogPicker({ kind: "matboard", layerIndex });
  }

  function defaultFrameCategoryForLayerSku(sku: string): FrameCategory {
    const f = framesPool.find((x) => x.sku === sku);
    const c = f?.category;
    if (c === "wood" || c === "plastic" || c === "aluminum") return c;
    return "wood";
  }

  function openFrameCatalogForLayer(layerIndex: number) {
    const needed = Math.min(3, Math.max(1, layerIndex + 1));
    if (frameLayers.length < needed) applyFrameLayerCount(needed);
    const layerSku =
      frameLayers[layerIndex]?.sku ?? (layerIndex === 0 ? selectedSku : frameLayers[0]?.sku ?? selectedSku);
    setFramePickerCategory(defaultFrameCategoryForLayerSku(layerSku || framesPool[0]?.sku || frames[0]?.sku || ""));
    setFramePickerSort("stock_desc");
    setFramePickerSearch("");
    setCatalogPicker({ kind: "frame", layerIndex });
  }

  function pickFrameSku(sku: string) {
    if (!catalogPicker || catalogPicker.kind !== "frame") return;
    const idx = catalogPicker.layerIndex;
    const row = framesPool.find((x) => x.sku === sku);
    if (row) ensureFrameInMainState(row);
    setFrameLayers((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { sku };
      return next;
    });
    if (idx === 0) {
      setSelectedSku(sku);
      const f = row ?? frames.find((x) => x.sku === sku);
      if (f) {
        setFramePricePerMeter(f.retailPriceMeter);
        setFrameProfileWidthMm(Number(f.widthMm ?? 40) || 40);
      }
    }
    setCatalogPicker(null);
  }

  function pickMatboardSku(sku: string) {
    if (!catalogPicker || catalogPicker.kind !== "matboard") return;
    const idx = catalogPicker.layerIndex;
    setMatboardLayers((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], sku };
      return next;
    });
    setCatalogPicker(null);
  }

  const resetFormAfterOrder = useCallback(() => {
    calcSeqRef.current += 1;
    setResult(null);
    setCatalogPicker(null);
    setCustomerName("");
    setPhone("");
    setEmail("");
    setComment("");
    setFrameQuantity(1);
    setCustomerLookup(null);
    setWidthMm(304);
    setHeightMm(600);
    setGlassId("regular");
    setBackingId("cardboard");
    setMatboardLayers([]);
    setHangerId("");
    setSubframeId("");
    setFinishingId("");
    setAssemblyProductId("");
    setStandLegId("");
    setFrameRemoteList([]);
    if (frames.length > 0) {
      const first = frames[0]!;
      setSelectedSku(first.sku);
      setFramePricePerMeter(first.retailPriceMeter);
      setFrameProfileWidthMm(Number(first.widthMm ?? 40) || 40);
      setFrameLayers([{ sku: first.sku }]);
    } else {
      setSelectedSku("");
      setFrameLayers([]);
      setFramePricePerMeter(10056);
      setFrameProfileWidthMm(40);
    }
    if (stores.length > 0) {
      setStore((stores[0] as Store).name);
    } else {
      setStore("");
    }
  }, [frames, stores]);

  const hangerPrice = hangerId ? (materials?.hangers?.find((h) => h.id === hangerId)?.price ?? 0) : 0;
  const subframePrice = subframeId ? lineAccPrice(materials?.subframes, subframeId, openingPerimeterM) : 0;
  const finishingPrice = finishingId ? lineAccPrice(materials?.finishings, finishingId, openingPerimeterM) : 0;
  const assemblyProductPrice = assemblyProductId
    ? lineAccPrice(materials?.assemblyProducts, assemblyProductId, openingPerimeterM)
    : 0;
  const standLegPrice = standLegId ? lineAccPrice(materials?.standLegs, standLegId, openingPerimeterM) : 0;
  const accessoriesTotal = hangerPrice + subframePrice + finishingPrice + assemblyProductPrice + standLegPrice;
  /** Целые рубли: расчёт API даёт копейки, аксессуары — float; без округления «Итого» с хвостом .33 */
  const unitTotal = Math.round((result?.total ?? 0) + accessoriesTotal);
  const lineQty = Math.max(1, Math.min(500, Math.floor(Number(frameQuantity)) || 1));
  const lineTotal = Math.round(unitTotal * lineQty);

  function swapOrientation() {
    const w = widthMm;
    const h = heightMm;
    setWidthMm(h);
    setHeightMm(w);
  }

  useEffect(() => {
    void runCalc();
  }, [runCalc]);

  useEffect(() => {
    const digits = digitsOnly(phone);
    if (!digits) {
      setCustomerLookup(null);
      return;
    }

    const normalizedDigits = digits.startsWith(PHONE_373_DIGITS) ? digits : `${PHONE_373_DIGITS}${digits}`;
    const localDigits = normalizedDigits.slice(PHONE_373_DIGITS.length);
    if (localDigits.length < 7) {
      setCustomerLookup(null);
      return;
    }

    const queryPhone = `+${normalizedDigits}`;
    const queryCandidates = new Set<string>([
      digits, // как ввели (цифры)
      localDigits, // локальная часть
      normalizedDigits, // с 373
    ]);

    const t = setTimeout(async () => {
      setPhoneSearching(true);
      try {
        const res = await fetch(`/api/customers?phone=${encodeURIComponent(queryPhone)}`);
        const data = await res.json();
        if (data && typeof data === "object" && !Array.isArray(data) && "name" in data) {
          setCustomerLookup(data);
          const customer = data as { name?: string; email?: string };
          if (typeof customer.name === "string") setCustomerName(customer.name);
          setEmail(customer.email ?? "");
          return;
        }

        // Fallback: поиск по списку (на случай несовпадения формата phoneNormalized в БД)
        const listRes = await fetch("/api/customers");
        const list = (await listRes.json()) as Array<{
          phone?: string;
          id?: string;
          name?: string;
          email?: string;
          orderIds?: string[];
        }>;

        const match = list.find((c) => {
          const cDigits = c.phone ? digitsOnly(c.phone) : "";
          if (!cDigits) return false;
          return queryCandidates.has(cDigits);
        });

        if (match && match.name) {
          setCustomerLookup({
            id: match.id ?? "",
            name: match.name ?? "",
            phone: match.phone ?? "",
            email: match.email ?? undefined,
            orderIds: match.orderIds ?? []
          });
          setCustomerName(match.name ?? "");
          setEmail(match.email ?? "");
        } else {
          setCustomerLookup(null);
        }
      } catch {
        setCustomerLookup(null);
      } finally {
        setPhoneSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) return;
    if (!result) return;
    setSubmitting(true);
    try {
      const finishingNameForConfig =
        finishingId.trim() && materials?.finishings
          ? materials.finishings.find((x) => x.id === finishingId)?.name?.trim() ?? ""
          : "";
      const glassList = materials?.glass?.length ? materials.glass : rules?.glassPrices ?? [];
      const backingList = materials?.backing?.length ? materials.backing : rules?.backingPrices ?? [];
      const glassNameForConfig = glassList.find((g) => g.id === glassId)?.name?.trim() ?? "";
      const backingNameForConfig = backingList.find((b) => b.id === backingId)?.name?.trim() ?? "";
      const matboardLayersForConfig = matboardLayers.map((l) => {
        const name = matboards.find((m) => m.sku === l.sku)?.name?.trim();
        return {
          sku: l.sku,
          marginMm: l.marginMm,
          ...(name ? { name } : {})
        };
      });
      const orderConfig = {
        widthMm,
        heightMm,
        quantity: lineQty,
        selectedSku,
        frameLayers: frameLayers
          .filter((l) => l.sku)
          .map((l) => {
            const f = frames.find((x) => x.sku === l.sku);
            return {
              sku: l.sku,
              profileWidthMm: Number(f?.widthMm ?? 40) || 40,
              pricePerMeter: Number(f?.retailPriceMeter ?? 0) || 0,
              wasteCoeff: rules?.frameWasteCoeff ?? 1.1
            };
          }),
        framePricePerMeter,
        frameWasteCoeff: rules?.frameWasteCoeff ?? 1.1,
        frameProfileWidthMm,
        glassId,
        backingId,
        ...(glassNameForConfig ? { glassName: glassNameForConfig } : {}),
        ...(backingNameForConfig ? { backingName: backingNameForConfig } : {}),
        useMatboard: matboardLayers.length > 0,
        withMatboard: matboardLayers.length > 0,
        matboardLayers: matboardLayersForConfig,
        matboardWidthMm: matboardLayers[0]?.marginMm ?? 0,
        selectedMatboardSku: matboardLayers[0]?.sku || undefined,
        hangerId: hangerId || undefined,
        ...(hangerId.trim() && materials?.hangers
          ? (() => {
              const n = materials.hangers!.find((h) => h.id === hangerId)?.name?.trim();
              return n ? { hangerName: n } : {};
            })()
          : {}),
        subframeId: subframeId || undefined,
        ...(subframeId.trim() && materials?.subframes
          ? (() => {
              const n = materials.subframes!.find((h) => h.id === subframeId)?.name?.trim();
              return n ? { subframeName: n } : {};
            })()
          : {}),
        finishingId: finishingId || undefined,
        ...(finishingNameForConfig ? { finishingName: finishingNameForConfig } : {}),
        assemblyProductId: assemblyProductId || undefined,
        ...(assemblyProductId.trim() && materials?.assemblyProducts
          ? (() => {
              const n = materials.assemblyProducts!.find((h) => h.id === assemblyProductId)?.name?.trim();
              return n ? { assemblyProductName: n } : {};
            })()
          : {}),
        standLegId: standLegId || undefined,
        ...(standLegId.trim() && materials?.standLegs
          ? (() => {
              const n = materials.standLegs!.find((h) => h.id === standLegId)?.name?.trim();
              return n ? { standLegName: n } : {};
            })()
          : {}),
        assemblyPrice: rules?.assemblyPrice ?? 750,
        assembly: result.assembly,
        frame: result.frame,
        matboard: result.matboard,
        glass: result.glass,
        backing: result.backing
      };
      const outerDims = getOrderOuterDimensionsMm(orderConfig as unknown as Record<string, unknown>);
      const orderConfigWithOuter = outerDims
        ? { ...orderConfig, outerWidthMm: outerDims.w, outerHeightMm: outerDims.h }
        : orderConfig;

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          store: store.trim() || undefined,
          comment: comment.trim() || undefined,
          total: lineTotal,
          config: orderConfigWithOuter
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        id?: string;
        orderId?: string;
        orderNumber?: string;
        message?: string | string[];
      };
      if (res.ok && data.ok) {
        const internalId = String(data.orderId ?? data.id ?? "").trim() || "—";
        const pub = String(data.orderNumber ?? "").trim();
        const receiptCatalog = materials
          ? accessoryCatalogFromMaterialsResponse({
              hangers: materials.hangers,
              subframes: materials.subframes,
              assemblyProducts: materials.assemblyProducts,
              standLegs: materials.standLegs,
              finishings: materials.finishings
            })
          : null;
        const receiptPayload: OrderReceiptInput = {
          orderId: internalId,
          ...(pub ? { orderNumber: pub } : {}),
          createdAtIso: new Date().toISOString(),
          customerName: customerName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          store: store.trim() || undefined,
          comment: comment.trim() || undefined,
          total: lineTotal,
          statusLabel: "Новый",
          config: orderConfigWithOuter as unknown as Record<string, unknown>,
          ...(receiptCatalog ? { accessoryCatalog: receiptCatalog } : {})
        };
        const tryPrint = () => {
          if (!printOrderReceipt(receiptPayload)) {
            toast.error("Разрешите всплывающие окна для печати квитанции");
          }
        };

        onCreated();
        resetFormAfterOrder();
        if (onGoToHistory) {
          toast.custom(
            (t) => (
              <div
                className="bo-card bo-card-body"
                style={{
                  padding: 12,
                  maxWidth: 340,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
                }}
              >
                <div style={{ marginBottom: 10, fontWeight: 600 }}>Заказ создан</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" className="bo-btn bo-btn-secondary" onClick={() => tryPrint()}>
                    Распечатать квитанцию
                  </button>
                  <button
                    type="button"
                    className="bo-btn bo-btn-primary"
                    onClick={() => {
                      toast.dismiss(t.id);
                      onGoToHistory();
                    }}
                  >
                    Перейти к истории
                  </button>
                  <button type="button" className="bo-btn bo-btn-ghost" onClick={() => toast.dismiss(t.id)}>
                    Закрыть
                  </button>
                </div>
              </div>
            ),
            { duration: 12000 }
          );
        } else {
          toast.custom(
            (t) => (
              <div
                className="bo-card bo-card-body"
                style={{
                  padding: 12,
                  maxWidth: 340,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
                }}
              >
                <div style={{ marginBottom: 10, fontWeight: 600 }}>Заказ создан</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" className="bo-btn bo-btn-secondary" onClick={() => tryPrint()}>
                    Распечатать квитанцию
                  </button>
                  <button type="button" className="bo-btn bo-btn-primary" onClick={() => toast.dismiss(t.id)}>
                    OK
                  </button>
                </div>
              </div>
            ),
            { duration: 12000 }
          );
        }
        if (mode === "modal") {
          onClose();
        }
      } else {
        const msg =
          typeof data.message === "string"
            ? data.message
            : Array.isArray(data.message)
              ? data.message.join(" ")
              : "Ошибка создания заказа";
        toast.error(msg);
      }
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    if (mode === "inline") {
      return (
        <div className="bo-card bo-card-body" style={{ padding: 20 }}>
          Загрузка…
        </div>
      );
    }
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={onClose}
      >
        <div className="bo-card bo-card-body" onClick={(e) => e.stopPropagation()}>
          Загрузка…
        </div>
      </div>
    );
  }

  const priceBreakdown = result ? (
      <div
        style={{
          marginBottom: 20,
          padding: 16,
          background: "#f8fafc",
          borderRadius: 8,
          border: "1px solid var(--bo-border)",
        }}
      >
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Багет</span>
            <span>{result.frame.toLocaleString("ru-RU")} руб.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Паспарту</span>
            <span>{result.matboard.toLocaleString("ru-RU")} руб.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Стекло</span>
            <span>{result.glass.toLocaleString("ru-RU")} руб.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Задник</span>
            <span>{result.backing.toLocaleString("ru-RU")} руб.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Сборка</span>
            <span>{result.assembly.toLocaleString("ru-RU")} руб.</span>
          </div>
          {hangerPrice > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Подвес</span>
              <span>{hangerPrice.toLocaleString("ru-RU")} руб.</span>
            </div>
          ) : null}
          {subframePrice > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Подрамник</span>
              <span>{subframePrice.toLocaleString("ru-RU")} руб.</span>
            </div>
          ) : null}
          {finishingPrice > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Изделие</span>
              <span>{finishingPrice.toLocaleString("ru-RU")} руб.</span>
            </div>
          ) : null}
          {assemblyProductPrice > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>По оформлению / сборка</span>
              <span>{assemblyProductPrice.toLocaleString("ru-RU")} руб.</span>
            </div>
          ) : null}
          {standLegPrice > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Ножка</span>
              <span>{standLegPrice.toLocaleString("ru-RU")} руб.</span>
            </div>
          ) : null}
        </div>
        <div
          style={{
            borderTop: "2px solid var(--bo-border)",
            marginTop: 12,
            paddingTop: 12,
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          <span>Итого{lineQty > 1 ? ` (${lineQty} шт.)` : ""}</span>
          <span style={{ color: "var(--bo-accent)" }}>{lineTotal.toLocaleString("ru-RU")} руб.</span>
        </div>
      </div>
    ) : (
      <div
        className="bo-text-muted"
        style={{
          marginBottom: 20,
          padding: 16,
          background: "#f8fafc",
          borderRadius: 8,
          border: "1px dashed var(--bo-border)",
          fontSize: 14,
        }}
      >
        Расчёт стоимости…
      </div>
    );

  const calculationSection = (
          <section style={{ marginBottom: mode === "inline" ? 0 : 24 }}>
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--bo-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Расчёт
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Ширина (мм)</span>
                  <input
                    type="number"
                    className="bo-input"
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value) || 0)}
                  />
                </label>
                <button
                  type="button"
                  className="bo-btn bo-btn-secondary"
                  onClick={swapOrientation}
                  title="Поменять ширину и высоту местами (книжная ↔ альбомная)"
                  style={{
                    height: 38,
                    minWidth: 44,
                    padding: "0 12px",
                    fontSize: 18,
                    lineHeight: 1,
                    marginBottom: 1,
                  }}
                >
                  ⇄
                </button>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                  <span>Высота (мм)</span>
                  <input
                    type="number"
                    className="bo-input"
                    value={heightMm}
                    onChange={(e) => setHeightMm(Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <label
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <span>Количество рамок (одинаковых)</span>
                <input
                  type="number"
                  className="bo-input"
                  style={{ maxWidth: 160 }}
                  min={1}
                  max={500}
                  value={frameQuantity}
                  onChange={(e) => {
                    const v = Math.floor(Number(e.target.value));
                    setFrameQuantity(Number.isFinite(v) ? Math.max(1, Math.min(500, v)) : 1);
                  }}
                />
              </label>
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>Багет</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                  className="bo-calc-option-row"
                >
                  <span className="bo-calc-option-row__label">Слои багета</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div className="bo-calc-chip-row">
                      {([1, 2, 3] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`bo-calc-chip ${frameLayers.length === n ? "bo-calc-chip--active" : ""}`}
                          onClick={() => applyFrameLayerCount(n)}
                          title={n === 1 ? "Один профиль" : `${n} слоя багета — не число рам`}
                        >
                          {n === 1 ? "1 слой" : `${n} слоя`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {frameLayers.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {frameLayers.map((layer, idx) => (
                      <div key={idx} className="bo-calc-layer-card">
                        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                          <span>Слой багета {idx + 1}</span>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "stretch",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                              <BaguetteSkuCombobox
                                value={layer.sku}
                                disabled={loading}
                                pool={framesPool}
                                onSearchQuery={requestFrameSearch}
                                placeholder={`Слой ${idx + 1}: артикул или название`}
                                onPick={(sku, frame) => {
                                  const f = frame ?? framesPool.find((x) => x.sku === sku);
                                  if (f) ensureFrameInMainState(f);
                                  setFrameLayers((prev) => {
                                    const next = [...prev];
                                    if (next[idx]) next[idx] = { sku };
                                    return next;
                                  });
                                  if (idx === 0) {
                                    setSelectedSku(sku);
                                    if (f) {
                                      setFramePricePerMeter(f.retailPriceMeter);
                                      setFrameProfileWidthMm(Number(f.widthMm ?? 40) || 40);
                                    }
                                  }
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="bo-btn bo-btn-secondary"
                              style={{ padding: "8px 10px", fontSize: 12, whiteSpace: "nowrap", alignSelf: "center" }}
                              onClick={() => openFrameCatalogForLayer(idx)}
                            >
                              Выбрать с каталога
                            </button>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <label
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <span>Подрамник</span>
                <select className="bo-select" value={subframeId} onChange={(e) => setSubframeId(e.target.value)}>
                  <option value="">Нет</option>
                  {(materials?.subframes ?? []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {accOptionLabel(h, openingPerimeterM)}
                    </option>
                  ))}
                </select>
              </label>
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
                className="bo-calc-option-row"
              >
                <span className="bo-calc-option-row__label">Паспарту</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div className="bo-calc-chip-row">
                    {([0, 1, 2, 3] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`bo-calc-chip ${matboardLayers.length === n ? "bo-calc-chip--active" : ""}`}
                        onClick={() => applyMatboardLayerCount(n)}
                      >
                        {n === 0 ? "НЕТ" : n === 1 ? "1 слой" : `${n} слоя`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {matboardLayers.length > 0 ? (
                <div style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}>
                  {matboardLayers.map((layer, idx) => (
                    <div key={idx} className="bo-calc-layer-card">
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                          <span>Слой {idx + 1} - поле (мм)</span>
                          <input
                            type="number"
                            className="bo-input"
                            min={0}
                            value={layer.marginMm}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setMatboardLayers((prev) => {
                                const next = [...prev];
                                if (next[idx]) next[idx] = { ...next[idx], marginMm: Number.isFinite(v) ? Math.max(0, v) : 0 };
                                return next;
                              });
                            }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                          <span>Слой {idx + 1} - артикул</span>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "stretch",
                              flexWrap: "wrap",
                            }}
                          >
                            <select
                              id={idx === 0 ? "matboard-sku-select" : undefined}
                              ref={idx === 0 ? matboardSkuSelectRef : undefined}
                              className="bo-select"
                              style={{ flex: "1 1 160px", minWidth: 0 }}
                              value={layer.sku}
                              onChange={(e) => {
                                const sku = e.target.value;
                                setMatboardLayers((prev) => {
                                  const next = [...prev];
                                  if (next[idx]) next[idx] = { ...next[idx], sku };
                                  return next;
                                });
                              }}
                              disabled={matboards.length === 0}
                            >
                              {matboards.length === 0 ? (
                                <option value="">Каталог паспарту пуст</option>
                              ) : (
                                matboards.map((m) => (
                                  <option key={m.sku} value={m.sku}>
                                    {m.sku} — {m.name} ({Number(m.pricePerM2 ?? 0).toLocaleString("ru-RU")} руб./м²)
                                  </option>
                                ))
                              )}
                            </select>
                            <button
                              type="button"
                              className="bo-btn bo-btn-secondary"
                              style={{ padding: "8px 10px", fontSize: 12, whiteSpace: "nowrap", alignSelf: "center" }}
                              disabled={matboards.length === 0}
                              onClick={() => openMatboardCatalogForLayer(idx)}
                            >
                              Выбрать с каталога
                            </button>
                          </div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid var(--bo-border)",
                    background: "var(--bo-surface-elevated)",
                    boxShadow: "var(--bo-shadow)",
                  }}
                >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--bo-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 14,
                    paddingBottom: 10,
                    borderBottom: "1px solid var(--bo-border)",
                  }}
                >
                  Дополнительные материалы
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px 16px",
                    alignItems: "start",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    <span>Стекло</span>
                    <select
                      className="bo-select"
                      value={glassId}
                      onChange={(e) => setGlassId(e.target.value)}
                    >
                      {(materials?.glass?.length ? materials.glass : rules?.glassPrices ?? []).map((g) => {
                        const p = "pricePerM2" in g ? g.pricePerM2 : (g as { price: number }).price;
                        return (
                          <option key={g.id} value={g.id}>
                            {g.name} ({(p ?? 0).toLocaleString("ru-RU")} руб./м²)
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    <span>Задник</span>
                    <select
                      className="bo-select"
                      value={backingId}
                      onChange={(e) => setBackingId(e.target.value)}
                    >
                      {(materials?.backing?.length ? materials.backing : rules?.backingPrices ?? []).map((b) => {
                        const p = "pricePerM2" in b ? b.pricePerM2 : (b as { price: number }).price;
                        return (
                          <option key={b.id} value={b.id}>
                            {b.name} ({(p ?? 0).toLocaleString("ru-RU")} руб./м²)
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    <span>Подвес</span>
                    <select className="bo-select" value={hangerId} onChange={(e) => setHangerId(e.target.value)}>
                      <option value="">Нет</option>
                      {(materials?.hangers ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({Number(h.price ?? 0).toLocaleString("ru-RU")} руб.)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    <span>Изделие</span>
                    <select className="bo-select" value={finishingId} onChange={(e) => setFinishingId(e.target.value)}>
                      <option value="">Нет</option>
                      {(materials?.finishings ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {accOptionLabel(h, openingPerimeterM)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    <span>По оформлению</span>
                    <select
                      className="bo-select"
                      value={assemblyProductId}
                      onChange={(e) => setAssemblyProductId(e.target.value)}
                    >
                      <option value="">Нет</option>
                      {(materials?.assemblyProducts ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {accOptionLabel(h, openingPerimeterM)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      minWidth: 0,
                    }}
                  >
                    <span>Ножка</span>
                    <select className="bo-select" value={standLegId} onChange={(e) => setStandLegId(e.target.value)}>
                      <option value="">Нет</option>
                      {(materials?.standLegs ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {accOptionLabel(h, openingPerimeterM)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                </div>
              </div>
            </div>
          </section>
  );

  const clientForm = (
          <form onSubmit={handleSubmit}>
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--bo-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Клиент
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: mode === "inline" ? "1fr" : "1fr 1fr",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                <span>Телефон</span>
                <input
                  type="tel"
                  className="bo-input"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone373(e.target.value))}
                  placeholder="+373 …"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={14}
                />
                {phoneSearching && (
                  <span style={{ fontSize: 12, color: "var(--bo-text-muted)" }}>Поиск…</span>
                )}
                {customerLookup && !phoneSearching && (
                  <span style={{ fontSize: 12, color: "var(--bo-accent)", fontWeight: 500 }}>
                    Найден: {customerLookup.name}
                    {customerLookup.orderIds && customerLookup.orderIds.length > 0
                      ? ` - ${customerLookup.orderIds.length} заказов`
                      : ""}
                  </span>
                )}
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                <span>Имя *</span>
                <input
                  className="bo-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  placeholder="ФИО или имя"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                <span>Email</span>
                <input
                  type="email"
                  className="bo-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                <span>Магазин</span>
                <select
                  className="bo-select"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                >
                  <option value="">—</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <span>Комментарий</span>
                <textarea
                  className="bo-input"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  style={{ resize: "vertical", minHeight: 64 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="submit"
                className="bo-btn bo-btn-primary"
                disabled={submitting || !result}
              >
                {submitting ? "Оформление…" : "Заказать"}
              </button>
              <button type="button" className="bo-btn bo-btn-secondary" onClick={onClose}>
                Отмена
              </button>
            </div>
          </form>
  );

  const body =
    mode === "inline" ? (
      <div className="bo-add-order-inline">
        <div
          className="bo-card"
          style={{
            minWidth: 0,
            width: "100%",
            margin: 0,
          }}
        >
          <div className="bo-card-body" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 600 }}>Калькулятор</h2>
            {calculationSection}
          </div>
        </div>
        <div
          className="bo-card"
          style={{
            minWidth: 0,
            width: "100%",
            position: "sticky",
            top: 12,
            alignSelf: "start",
            margin: 0,
          }}
        >
          <div className="bo-card-body" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>Итого и оформление</h2>
            {priceBreakdown}
            {clientForm}
          </div>
        </div>
      </div>
    ) : (
      <div
        className="bo-card"
        style={{
          maxWidth: 980,
          width: "100%",
          margin: 0,
          maxHeight: "95vh",
          overflow: "auto",
        }}
      >
        <div className="bo-card-body" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 600 }}>
            Добавить заказ - Калькулятор
          </h2>
          {calculationSection}
          {priceBreakdown}
          {clientForm}
        </div>
      </div>
    );

  const pickerModal =
    catalogPicker && catalogPicker.kind === "frame" ? (
      <div
        className="bo-modal-overlay"
        style={{ zIndex: 2000 }}
        onClick={() => setCatalogPicker(null)}
      >
        <div className="bo-modal" style={{ maxWidth: 980, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
          <div className="bo-modal-header">
            <div className="bo-modal-title">Каталог багета</div>
            <button type="button" className="bo-modal-close" onClick={() => setCatalogPicker(null)} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="bo-modal-body" style={{ maxHeight: "70vh", overflow: "auto" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 16,
                alignItems: "flex-end",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span>Категория</span>
                <select
                  className="bo-select"
                  value={framePickerCategory}
                  onChange={(e) => setFramePickerCategory(e.target.value as "" | FrameCategory)}
                  style={{ minWidth: 140 }}
                >
                  <option value="">Все</option>
                  {(Object.keys(FRAME_CATEGORY_LABELS) as FrameCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {FRAME_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: "1 1 160px" }}>
                <span>Сортировка</span>
                <select
                  className="bo-select"
                  value={framePickerSort}
                  onChange={(e) =>
                    setFramePickerSort(e.target.value as "stock_desc" | "stock_asc" | "sku")
                  }
                  style={{ width: "100%" }}
                >
                  <option value="stock_desc">Сначала в наличии</option>
                  <option value="stock_asc">Сначала под заказ</option>
                  <option value="sku">По артикулу</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: "1 1 200px" }}>
                <span>Поиск</span>
                <input
                  type="search"
                  className="bo-input"
                  placeholder="Артикул или название"
                  value={framePickerSearch}
                  onChange={(e) => setFramePickerSearch(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>
            {framePickerSearch.trim() ? (
              <p style={{ fontSize: 12, color: "var(--bo-text-muted)", margin: "0 0 12px", lineHeight: 1.45 }}>
                Поиск идёт по всем категориям; пока поле поиска не пустое, фильтр «Категория» не действует.
              </p>
            ) : null}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12
              }}
            >
              {framePickerItems.map((item) => {
                const stock = Number(item.stockMeters) || 0;
                const minS = item.minStockMeters;
                const low =
                  minS != null && minS > 0 && stock < minS;
                const inStock = stock > 0;
                return (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => pickFrameSku(item.sku)}
                    className="bo-card"
                    style={{ textAlign: "left", cursor: "pointer", padding: 10, position: "relative" }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        zIndex: 1,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: inStock ? "#dcfce7" : "#fef3c7",
                          color: inStock ? "#166534" : "#92400e",
                        }}
                      >
                        {inStock ? "В наличии" : "Под заказ"}
                      </span>
                    </div>
                    <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FrameCatalogChainImg
                        item={{ sku: item.sku, imageUrl: item.imageUrl, previewImageUrl: item.previewImageUrl }}
                        alt={item.name}
                        style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }}
                      />
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13 }}>Арт. {item.sku}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--bo-text-muted)" }}>{item.name}</div>
                    {item.category ? (
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--bo-text-muted)" }}>
                        {FRAME_CATEGORY_LABELS[item.category] ?? item.category}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                      {item.retailPriceMeter.toLocaleString("ru-RU")} руб./м
                    </div>
                    <div style={{ fontSize: 12, marginTop: 6, color: "var(--bo-text-muted)" }}>
                      Склад:{" "}
                      <strong style={{ color: "var(--bo-text)" }}>
                        {stock.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м
                      </strong>
                      {low ? (
                        <span style={{ marginLeft: 6, color: "#b45309", fontWeight: 600 }}>
                          мало (порог {minS} м)
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {framePickerItems.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--bo-text-muted)", fontSize: 14 }}>
                Ничего не найдено — измените фильтры или поиск
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : catalogPicker && catalogPicker.kind === "matboard" ? (
      <div
        className="bo-modal-overlay"
        style={{ zIndex: 2000 }}
        onClick={() => setCatalogPicker(null)}
      >
        <div className="bo-modal" style={{ maxWidth: 980, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
          <div className="bo-modal-header">
            <div className="bo-modal-title">Каталог паспарту</div>
            <button type="button" className="bo-modal-close" onClick={() => setCatalogPicker(null)} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="bo-modal-body" style={{ maxHeight: "70vh", overflow: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12
              }}
            >
              {(matboards ?? []).map((item) => (
                <button
                  key={item.sku}
                  type="button"
                  onClick={() => pickMatboardSku(item.sku)}
                  className="bo-card"
                  style={{ textAlign: "left", cursor: "pointer", padding: 10 }}
                >
                  <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img
                      src={toBackofficeImageSrc(item.imageUrl, item.sku)}
                      alt={item.name}
                      style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }}
                      loading="lazy"
                    />
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13 }}>Арт. {item.sku}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--bo-text-muted)" }}>{item.name}</div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                    {item.pricePerM2.toLocaleString("ru-RU")} руб./м²
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    ) : null;

  if (mode === "inline") {
    return (
      <>
        {pickerModal}
        {body}
      </>
    );
  }

  return (
    <>
      {pickerModal}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={onClose}
      >
        <div onClick={(e) => e.stopPropagation()}>{body}</div>
      </div>
    </>
  );
}
