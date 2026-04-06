"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getOrderOuterDimensionsMm } from "@yanak/receipt";
import { accessoryPriceForLine, openingPerimeterMeters, type AccessoryPriceUnitClient } from "@yanak/types";
import { Card } from "@yanak/ui";
import type { MatboardCatalogItem } from "./MatboardCatalogModal";
import { MmStepperInput } from "./MmStepperInput";
import type { FrameCatalogItem, FrameCategory } from "./types";
import { getFrameTextureResolvedSrc } from "./lib/frame-catalog-images";
import { normalizeFrameCatalogItems, normalizeMatboardCatalogItems } from "./lib/stock";
import { FramePreview } from "./FramePreview";

import "./constructor.css";

export type EmbedCheckoutPayload = {
  total: number;
  config: Record<string, unknown>;
  priceDetailLine?: string;
};

const CatalogModal = dynamic(
  () => import("./CatalogModal").then((m) => m.CatalogModal),
  { ssr: false }
);
const MatboardCatalogModal = dynamic(
  () => import("./MatboardCatalogModal").then((m) => m.MatboardCatalogModal),
  { ssr: false }
);

type PricingResponse = {
  frame: number;
  matboard: number;
  glass: number;
  backing: number;
  assembly: number;
  rush: number;
  discount: number;
  total: number;
};

type AccExtra = { id: string; name: string; price: number; priceUnit?: string };

type MaterialsData = {
  glass: { id: string; name: string; pricePerM2: number }[];
  backing: { id: string; name: string; pricePerM2: number | null; note: string }[];
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

type PricingRules = {
  frameWasteCoeff: number;
  assemblyPrice: number;
  minimalOrderPrice: number;
  matboardPricePerM2: number;
};

const DEFAULT_MATERIALS: MaterialsData = {
  glass: [
    { id: "none", name: "Нет", pricePerM2: 0 },
    { id: "regular", name: "Обычное", pricePerM2: 2000 },
    { id: "matte", name: "Матовое", pricePerM2: 4500 },
    { id: "anti_glare", name: "Антиблик", pricePerM2: 21250 },
    { id: "acrylic", name: "Пластиковое", pricePerM2: 2200 }
  ],
  backing: [
    { id: "none", name: "Нет", pricePerM2: 0, note: "" },
    { id: "cardboard", name: "Картон", pricePerM2: 875, note: "" },
    { id: "foam5", name: "Пенокартон 5 мм", pricePerM2: 2571, note: "" },
    { id: "stretch", name: "Натяжка вышивки", pricePerM2: null, note: "" },
    { id: "stretcher", name: "Подрамник", pricePerM2: null, note: "" }
  ]
};

const DEFAULT_PRICING: PricingRules = {
  frameWasteCoeff: 1.1,
  assemblyPrice: 750,
  minimalOrderPrice: 1500,
  matboardPricePerM2: 14552
};

const INITIAL_FRAME_CATEGORY: FrameCategory = "wood";

export function ConstructorApp({
  embed = false,
  onEmbedCheckout
}: {
  embed?: boolean;
  /** Встроенный режим в админке: без iframe / postMessage */
  onEmbedCheckout?: (payload: EmbedCheckoutPayload) => void;
}) {
  /** Согласовано с лимитом API каталога багета — на витрине раньше было 200, хвост по SKU не подгружался. */
  const frameListLimit = 2000;
  const framePrefetchLimit = 2000;
  /** Короткие подписи (только цифры): ≤640px и 968–1230px */
  /**
   * SSR даёт 1200px; первый клиентский кадр после useEffect подставлял реальную ширину —
   * менялся compactChips и вся правая колонка «прыгала». useLayoutEffect + синхронный set до paint.
   */
  /** Одинаковое начальное значение на SSR и при гидратации — иначе React даёт mismatch и страница может «обнулиться». */
  const [uiWidth, setUiWidth] = useState(1200);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    setUiWidth(Math.round(window.innerWidth));
    let raf = 0;
    const apply = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setUiWidth(Math.round(window.innerWidth));
      });
    };
    window.addEventListener("resize", apply);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", apply);
    };
  }, []);
  const compactChips = uiWidth <= 640 || (uiWidth > 968 && uiWidth <= 1230);
  const [form, setForm] = useState({ widthMm: 300, heightMm: 200, framePricePerMeter: 2200, frameWasteCoeff: 1.1, minimalOrderPrice: 1500 });
  const [frameLayers, setFrameLayers] = useState<{ sku: string }[]>([]);
  /** Слои паспарту: снаружи к центру — первый элемент = ближе к стеклу (внутренний слой) */
  const [matboardLayers, setMatboardLayers] = useState<{ sku: string; marginMm: number }[]>([]);
  const [matboardLayerEditIndex, setMatboardLayerEditIndex] = useState(0);
  const [frameProfileWidthMm, setFrameProfileWidthMm] = useState(40);
  const [glassType, setGlassType] = useState("none");
  const [backingType, setBackingType] = useState("none");
  const [hangerId, setHangerId] = useState("");
  const [subframeId, setSubframeId] = useState("");
  const [finishingId, setFinishingId] = useState("");
  const [assemblyProductId, setAssemblyProductId] = useState("");
  const [standLegId, setStandLegId] = useState("");
  const [promoCode, setPromoCode] = useState("");
  /** Сколько одинаковых рамок заказывают (один конфиг, общая сумма = цена за единицу × количество). */
  const [frameQuantity, setFrameQuantity] = useState(1);
  const [result, setResult] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [frameCategory, setFrameCategory] = useState<FrameCategory>("wood");
  const [catalog, setCatalog] = useState<FrameCatalogItem[]>([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [frameLayerEditIndex, setFrameLayerEditIndex] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [matboardCatalog, setMatboardCatalog] = useState<MatboardCatalogItem[]>([]);
  const [matboardCatalogLoading, setMatboardCatalogLoading] = useState(false);
  const [matboardCatalogError, setMatboardCatalogError] = useState("");
  const [matboardModalOpen, setMatboardModalOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialsData>(DEFAULT_MATERIALS);
  const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const catalogCacheRef = useRef<Partial<Record<FrameCategory, FrameCatalogItem[]>>>({});
  const [catalogCacheVersion, setCatalogCacheVersion] = useState(0);
  const matboardCacheRef = useRef<MatboardCatalogItem[] | null>(null);
  const calculateDebounceRef = useRef<number | null>(null);
  const [promoValidation, setPromoValidation] = useState<{
    discountPercent: number | null;
    discountAmount: number | null;
  } | null>(null);

  useEffect(() => {
    setCatalogLoading(true);
    let cancelled = false;

    async function applyMaterialsFromResponse(res: Response) {
      if (!res.ok) return;
      const materialsData = (await res.json()) as MaterialsData | Record<string, unknown> | null;
      if (
        !materialsData ||
        !Array.isArray((materialsData as MaterialsData).glass) ||
        !Array.isArray((materialsData as MaterialsData).backing)
      ) {
        return;
      }
      const md = materialsData as MaterialsData & Record<string, unknown>;
      const m = materialsData as Record<string, unknown>;
      if (!cancelled) {
        setMaterials((prev) => ({
          ...prev,
          glass: md.glass,
          backing: md.backing,
          ...(Array.isArray(m.hangers) ? { hangers: m.hangers as MaterialsData["hangers"] } : {}),
          ...(Array.isArray(m.subframes) ? { subframes: m.subframes as MaterialsData["subframes"] } : {}),
          ...(Array.isArray(m.assemblyProducts)
            ? { assemblyProducts: m.assemblyProducts as MaterialsData["assemblyProducts"] }
            : {}),
          ...(Array.isArray(m.standLegs) ? { standLegs: m.standLegs as MaterialsData["standLegs"] } : {}),
          ...(Array.isArray(m.finishings) ? { finishings: m.finishings as MaterialsData["finishings"] } : {})
        }));
      }
    }

    async function applyPricingFromResponse(res: Response) {
      if (!res.ok) return;
      const pricingData = (await res.json()) as Partial<PricingRules> | null;
      if (!cancelled && pricingData) {
        setPricingRules((prev) => ({
          ...prev,
          frameWasteCoeff: pricingData.frameWasteCoeff ?? prev.frameWasteCoeff,
          assemblyPrice: pricingData.assemblyPrice ?? prev.assemblyPrice,
          minimalOrderPrice: pricingData.minimalOrderPrice ?? prev.minimalOrderPrice,
          matboardPricePerM2: pricingData.matboardPricePerM2 ?? prev.matboardPricePerM2
        }));
        setForm((f) => ({
          ...f,
          frameWasteCoeff: pricingData.frameWasteCoeff ?? f.frameWasteCoeff,
          minimalOrderPrice: pricingData.minimalOrderPrice ?? f.minimalOrderPrice
        }));
      }
    }

    function applyFramesRaw(framesRaw: unknown) {
      const list = normalizeFrameCatalogItems(
        Array.isArray(framesRaw) ? (framesRaw as FrameCatalogItem[]) : []
      );
      catalogCacheRef.current = { [INITIAL_FRAME_CATEGORY]: list };
      setCatalogCacheVersion((v) => v + 1);
      setCatalog(list);
      const first = list[0];
      if (first) {
        setSelectedSku(first.sku);
        setFrameLayers((prev) => (prev.length > 0 ? prev : [{ sku: first.sku }]));
        setForm((prev) => ({ ...prev, framePricePerMeter: first.retailPriceMeter }));
        setFrameProfileWidthMm(first.widthMm ?? 40);
      }
    }

    (async () => {
      const materialsP = fetch("/api/materials", { cache: "no-store" });
      const pricingP = fetch("/api/pricing", { cache: "no-store" });
      const framesP = fetch(
        `/api/catalog/frames?category=${INITIAL_FRAME_CATEGORY}&limit=${frameListLimit}`,
        { cache: "no-store" }
      );

      try {
        if (embed) {
          const framesRes = await framesP;
          if (!cancelled && framesRes.ok) {
            applyFramesRaw(await framesRes.json());
            void prefetchCatalogCategories(true);
          }
          const [materialsRes, pricingRes] = await Promise.all([materialsP, pricingP]);
          await applyMaterialsFromResponse(materialsRes);
          await applyPricingFromResponse(pricingRes);
        } else {
          const [materialsRes, pricingRes, framesRes] = await Promise.all([materialsP, pricingP, framesP]);
          await applyMaterialsFromResponse(materialsRes);
          await applyPricingFromResponse(pricingRes);
          if (!cancelled && framesRes.ok) {
            applyFramesRaw(await framesRes.json());
          }
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
          setBootstrapReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [embed, frameListLimit]);

  /** ID стекла/задника из API (БД) могут не совпадать с дефолтами «none»/«cardboard» — иначе value не из списка, расчёт даёт 0. */
  useEffect(() => {
    const list = materials.glass;
    if (list.length === 0) return;
    if (!list.some((g) => g.id === glassType)) {
      const next = list.find((g) => g.id === "none") ?? list[0];
      if (next) setGlassType(next.id);
    }
  }, [materials.glass, glassType]);

  useEffect(() => {
    const list = materials.backing;
    if (list.length === 0) return;
    if (!list.some((b) => b.id === backingType)) {
      const next =
        list.find((b) => b.id === "cardboard") ??
        list.find((b) => b.id === "none") ??
        list[0];
      if (next) setBackingType(next.id);
    }
  }, [materials.backing, backingType]);

  async function loadMatboardCatalog() {
    if (matboardCacheRef.current) {
      setMatboardCatalog(matboardCacheRef.current);
      return;
    }
    setMatboardCatalogLoading(true);
    setMatboardCatalogError("");
    try {
      const res = await fetch(`/api/catalog/matboard?limit=${embed ? 56 : 120}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = (await res.json()) as unknown;
      const list = normalizeMatboardCatalogItems(
        Array.isArray(data) ? (data as MatboardCatalogItem[]) : []
      );
      matboardCacheRef.current = list;
      setMatboardCatalog(list);
      const first = list[0];
      if (first) {
        setMatboardLayers((prev) =>
          prev.length === 0 ? prev : prev.map((l) => (l.sku && list.some((m) => m.sku === l.sku) ? l : { ...l, sku: first.sku }))
        );
      }
    } catch (err) {
      setMatboardCatalogError(err instanceof Error ? err.message : "Ошибка каталога");
    } finally {
      setMatboardCatalogLoading(false);
    }
  }

  async function loadCatalog(category: FrameCategory, opts?: { bypassCache?: boolean }) {
    const cached = catalogCacheRef.current[category];
    if (cached && !opts?.bypassCache) {
      setCatalog(cached);
      const first = cached[0];
      if (first) {
        const newSku = cached.some((f) => f.sku === selectedSku) ? selectedSku : first.sku;
        const item = cached.find((f) => f.sku === newSku) ?? first;
        setSelectedSku(newSku);
        setFrameLayers((prev) => {
          if (prev.length === 0) return [{ sku: newSku }];
          const next = [...prev];
          next[0] = { sku: newSku };
          return next;
        });
        setForm((f) => ({ ...f, framePricePerMeter: item.retailPriceMeter }));
        setFrameProfileWidthMm(item.widthMm ?? 40);
      }
      return;
    }
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const response = await fetch(`/api/catalog/frames?category=${category}&limit=${frameListLimit}`, {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}`);
      }
      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new Error("Некорректный ответ");
      }
      const list = normalizeFrameCatalogItems(data as FrameCatalogItem[]);
      catalogCacheRef.current[category] = list;
      setCatalogCacheVersion((v) => v + 1);
      setCatalog(list);
      const first = list[0];
      if (first) {
        const newSku = list.some((f) => f.sku === selectedSku) ? selectedSku : first.sku;
        const item = list.find((f) => f.sku === newSku) ?? first;
        setSelectedSku(newSku);
        setFrameLayers((prev) => {
          if (prev.length === 0) return [{ sku: newSku }];
          const next = [...prev];
          next[0] = { sku: newSku };
          return next;
        });
        setForm((f) => ({ ...f, framePricePerMeter: item.retailPriceMeter }));
        setFrameProfileWidthMm(item.widthMm ?? 40);
      }
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Ошибка каталога");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function prefetchCatalogCategories(force?: boolean) {
    const allCats = ["wood", "plastic", "aluminum"] as const;
    if (!force) {
      const allFilled = allCats.every((c) => (catalogCacheRef.current[c]?.length ?? 0) > 0);
      if (allFilled) return;
    }
    const categories = force
      ? [...allCats]
      : (["wood", "plastic", "aluminum"] as FrameCategory[]).filter((c) => !catalogCacheRef.current[c]?.length);
    if (categories.length === 0) return;
    const results = await Promise.all(
      categories.map((cat) =>
        fetch(`/api/catalog/frames?category=${cat}&limit=${framePrefetchLimit}`, { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null
        )
      )
    );
    let updated = false;
    categories.forEach((cat, i) => {
      const data = results[i];
      if (Array.isArray(data)) {
        catalogCacheRef.current[cat] = normalizeFrameCatalogItems(data as FrameCatalogItem[]);
        updated = true;
      }
    });
    if (updated) setCatalogCacheVersion((v) => v + 1);
  }

  useEffect(() => {
    if (!embed || !catalogModalOpen) return;
    let cancelled = false;
    void (async () => {
      await prefetchCatalogCategories(true);
      if (cancelled) return;
      await loadCatalog(frameCategory, { bypassCache: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- обновляем каталог при открытии модалки (новые артикулы из админки)
  }, [embed, catalogModalOpen, frameCategory]);

  const glassItem = materials.glass.find((g) => g.id === glassType);
  const backingItem = materials.backing.find((b) => b.id === backingType);
  const glassPricePerM2 = glassItem?.pricePerM2 ?? 0;
  const backingPricePerM2 =
    backingItem?.pricePerM2 != null
      ? backingItem.pricePerM2
      : backingType === "stretch"
        ? (0.9 * (form.widthMm + form.heightMm) / ((form.widthMm * form.heightMm) / 1_000_000))
        : backingType === "stretcher"
          ? (1.1 * (form.widthMm + form.heightMm) / ((form.widthMm * form.heightMm) / 1_000_000))
          : 0;
  const withMatboard = matboardLayers.length > 0;
  const openingPerimeterM = useMemo(
    () =>
      openingPerimeterMeters({
        widthMm: form.widthMm,
        heightMm: form.heightMm,
        matboardLayers: matboardLayers.map((l) => ({ marginMm: l.marginMm })),
        withMatboard,
        useMatboard: withMatboard,
        matboardWidthMm: matboardLayers[0]?.marginMm ?? 0
      }),
    [form.widthMm, form.heightMm, matboardLayers, withMatboard]
  );
  const allFramesForLayers = useMemo(() => {
    const categories: FrameCategory[] = ["wood", "plastic", "aluminum"];
    const merged: FrameCatalogItem[] = [...catalog];
    for (const c of categories) {
      const list = catalogCacheRef.current[c];
      if (list && list.length > 0) merged.push(...list);
    }
    return merged;
  }, [catalog, catalogCacheVersion]);
  const selectedFrameLayers = useMemo(
    () =>
      frameLayers
        .map((l) => catalog.find((c) => c.sku === l.sku) ?? allFramesForLayers.find((c) => c.sku === l.sku))
        .filter((x): x is FrameCatalogItem => Boolean(x)),
    [frameLayers, catalog, allFramesForLayers]
  );
  /** Каждый слой из state — даже если позиции ещё нет в загруженном каталоге (новый артикул): превью и текстуры по SKU. */
  const previewFrameVisualLayers = useMemo((): FrameCatalogItem[] => {
    const fallback = (sku: string): FrameCatalogItem => ({
      sku,
      name: sku,
      category: "wood",
      widthMm: frameProfileWidthMm,
      widthWithoutQuarterMm: frameProfileWidthMm,
      retailPriceMeter: 0,
      imageUrl: "",
      isActive: true
    });
    return frameLayers.map(
      (l) =>
        catalog.find((c) => c.sku === l.sku) ??
        allFramesForLayers.find((c) => c.sku === l.sku) ??
        fallback(l.sku)
    );
  }, [frameLayers, catalog, allFramesForLayers, frameProfileWidthMm]);
  const frameTotalProfileWidthMm = useMemo(
    () =>
      selectedFrameLayers.length > 0
        ? selectedFrameLayers.reduce((s, f) => s + (Number(f.widthMm ?? 0) || 0), 0)
        : frameProfileWidthMm,
    [selectedFrameLayers, frameProfileWidthMm]
  );
  const previewFrameLayerWidths = useMemo(
    () =>
      previewFrameVisualLayers.length > 0
        ? previewFrameVisualLayers.map((f) => Number(f.widthMm ?? 0) || 0).filter((v) => v > 0)
        : [frameProfileWidthMm],
    [previewFrameVisualLayers, frameProfileWidthMm]
  );
  const previewFrameLayerTextures = useMemo(
    () => previewFrameVisualLayers.map((f) => getFrameTextureResolvedSrc(f)),
    [previewFrameVisualLayers]
  );

  const matboardTotalBorderMm = useMemo(
    () => matboardLayers.reduce((s, l) => s + (Number.isFinite(l.marginMm) ? l.marginMm : 0), 0),
    [matboardLayers]
  );
  const previewMatboardSku = matboardLayers[0]?.sku ?? "";
  const previewMatboardItem = matboardCatalog.find((m) => m.sku === previewMatboardSku);
  const previewMatboardLayerMargins = useMemo(
    () => matboardLayers.map((l) => Math.max(0, Number(l.marginMm) || 0)).filter((v) => v > 0),
    [matboardLayers]
  );

  /** Текстура каталога на каждый слой паспарту — иначе во превью только первый слой получал картинку, остальные — сплошной цвет. */
  const previewMatboardImageUrls = useMemo(() => {
    if (matboardLayers.length === 0) return undefined;
    const fallback = matboardCatalog[0]?.imageUrl?.trim() ?? "";
    return matboardLayers.map((layer) => {
      const item = matboardCatalog.find((m) => m.sku === layer.sku);
      const u = item?.imageUrl?.trim() ?? "";
      return u.length > 0 ? u : fallback;
    });
  }, [matboardLayers, matboardCatalog]);

  /** Как outer в FramePreview — чтобы скелетон при загрузке каталога занимал ту же площадь */
  const previewOuterMm = useMemo(() => {
    const m = matboardTotalBorderMm;
    const fw = frameTotalProfileWidthMm;
    return {
      w: form.widthMm + 2 * m + 2 * fw,
      h: form.heightMm + 2 * m + 2 * fw
    };
  }, [form.widthMm, form.heightMm, matboardTotalBorderMm, frameTotalProfileWidthMm]);

  useEffect(() => {
    const code = promoCode.trim();
    if (!code) {
      setPromoValidation(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store"
      })
        .then((r) => r.json())
        .then((data: { valid?: boolean; discountPercent?: number | null; discountAmount?: number | null }) => {
          if (cancelled) return;
          if (data.valid && (data.discountPercent != null || data.discountAmount != null)) {
            setPromoValidation({
              discountPercent: data.discountPercent ?? null,
              discountAmount: data.discountAmount ?? null
            });
          } else {
            setPromoValidation(null);
          }
        })
        .catch(() => {
          if (!cancelled) setPromoValidation(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [promoCode]);

  const promoDiscountAmount = promoValidation?.discountAmount ?? 0;
  const promoDiscountPercent = promoValidation?.discountPercent ?? 0;
  const hangerPrice = hangerId ? (materials.hangers?.find((h) => h.id === hangerId)?.price ?? 0) : 0;
  const subframePrice = subframeId ? lineAccPrice(materials.subframes, subframeId, openingPerimeterM) : 0;
  const finishingPrice = finishingId ? lineAccPrice(materials.finishings, finishingId, openingPerimeterM) : 0;
  const assemblyProductPrice = assemblyProductId
    ? lineAccPrice(materials.assemblyProducts, assemblyProductId, openingPerimeterM)
    : 0;
  const standLegPrice = standLegId ? lineAccPrice(materials.standLegs, standLegId, openingPerimeterM) : 0;
  const accessoriesTotal = hangerPrice + subframePrice + finishingPrice + assemblyProductPrice + standLegPrice;

  const calculateDebounceMs = embed ? 520 : 300;

  useEffect(() => {
    if (!bootstrapReady) {
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    const layersForApi =
      withMatboard && matboardLayers.length > 0
        ? matboardLayers
            .filter((l) => l.sku)
            .map((l) => ({
              marginMm: Math.max(0, l.marginMm),
              pricePerM2:
                matboardCatalog.find((m) => m.sku === l.sku)?.pricePerM2 ?? pricingRules.matboardPricePerM2
            }))
        : [];
    const frameLayersForApi =
      selectedFrameLayers.length > 0
        ? selectedFrameLayers.map((f) => ({
            profileWidthMm: Number(f.widthMm ?? 40) || 40,
            pricePerMeter: f.retailPriceMeter,
            wasteCoeff: form.frameWasteCoeff
          }))
        : [];
    const basePayload = {
      widthMm: form.widthMm,
      heightMm: form.heightMm,
      ...(frameLayersForApi.length > 0 ? { frameLayers: frameLayersForApi } : {}),
      ...(layersForApi.length > 0
        ? { matboardLayers: layersForApi }
        : { matboardMarginMm: 0, matboardPricePerM2: 0 }),
      framePricePerMeter: form.framePricePerMeter,
      frameWasteCoeff: form.frameWasteCoeff,
      frameProfileWidthMm: frameTotalProfileWidthMm,
      glassPricePerM2,
      backingPricePerM2,
      assemblyPrice: pricingRules.assemblyPrice,
      minimalOrderPrice: form.minimalOrderPrice,
      discountAmount: promoDiscountAmount
    };
    const payloadKey = JSON.stringify(basePayload);

    if (calculateDebounceRef.current !== null) {
      window.clearTimeout(calculateDebounceRef.current);
    }
    calculateDebounceRef.current = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      fetch("/api/pricing/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadKey,
        cache: "no-store",
        signal: ac.signal
      })
        .then(async (response) => {
          if (cancelled) return;
          const parsed = (await response.clone().json().catch(() => null)) as Record<string, unknown> | null;
          if (!response.ok) {
            const msg = (parsed as { message?: string } | null)?.message || `Ошибка расчёта (${response.status})`;
            throw new Error(msg);
          }
          const data = parsed as PricingResponse | null;
          if (!data) throw new Error("Некорректный ответ расчёта");
          data.total += accessoriesTotal;
          if (promoDiscountPercent > 0) {
            const pct = promoDiscountPercent <= 1 ? promoDiscountPercent : promoDiscountPercent / 100;
            data.total = Math.floor(data.total - data.total * pct);
          }
          const fq = Math.max(1, Math.min(500, Math.floor(Number(frameQuantity)) || 1));
          data.total = Math.round(data.total * fq);
          setResult(data);
        })
        .catch((err) => {
          if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
          const message = err instanceof Error ? err.message : "Ошибка";
          if (message.includes("body stream already read")) {
            setError("Ошибка расчёта. Обновите страницу.");
            return;
          }
          setError(message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, calculateDebounceMs);
    return () => {
      cancelled = true;
      ac.abort();
      if (calculateDebounceRef.current !== null) {
        window.clearTimeout(calculateDebounceRef.current);
      }
    };
  }, [
    bootstrapReady,
    form.widthMm,
    form.heightMm,
    form.framePricePerMeter,
    form.frameWasteCoeff,
    frameTotalProfileWidthMm,
    selectedFrameLayers,
    form.minimalOrderPrice,
    matboardLayers,
    matboardCatalog,
    glassType,
    backingType,
    hangerId,
    subframeId,
    finishingId,
    assemblyProductId,
    standLegId,
    accessoriesTotal,
    promoCode,
    promoValidation,
    glassPricePerM2,
    backingPricePerM2,
    pricingRules.assemblyPrice,
    pricingRules.matboardPricePerM2,
    calculateDebounceMs,
    frameQuantity
  ]);

  function handleChangeCategory(category: FrameCategory) {
    setFrameCategory(category);
    void loadCatalog(category);
  }

  function handleSelectSku(sku: string) {
    setSelectedSku(sku);
    setFrameLayers((prev) => {
      if (prev.length === 0) return [{ sku }];
      const next = [...prev];
      next[0] = { sku };
      return next;
    });
    const item = catalog.find((it) => it.sku === sku);
    if (!item) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      framePricePerMeter: item.retailPriceMeter
    }));
    setFrameProfileWidthMm(item.widthMm ?? 40);
  }

  const DEFAULT_MATBOARD_MARGIN_MM = 40;
  function applyFrameLayerCount(count: number) {
    const firstSku = selectedSku || catalog[0]?.sku || "";
    setFrameLayers((prev) => {
      const next: { sku: string }[] = [];
      for (let i = 0; i < count; i++) {
        next.push({ sku: prev[i]?.sku || firstSku });
      }
      return next;
    });
  }
  function toggleFrameLayerOrder() {
    setFrameLayers((prev) => [...prev].reverse());
  }

  function openFrameCatalog(layerIndex: number) {
    setFrameLayerEditIndex(layerIndex);
    setCatalogModalOpen(true);
    if (!embed) void prefetchCatalogCategories();
  }

  function applyMatboardLayerCount(count: number) {
    if (count === 0) {
      setMatboardLayers([]);
      return;
    }
    const defaultSku = matboardCatalog[0]?.sku ?? "";
    setMatboardLayers((prev) => {
      const next: { sku: string; marginMm: number }[] = [];
      for (let i = 0; i < count; i++) {
        const existing = prev[i];
        next.push({
          sku: existing?.sku || defaultSku,
          marginMm: Number.isFinite(existing?.marginMm) ? existing!.marginMm : DEFAULT_MATBOARD_MARGIN_MM
        });
      }
      return next;
    });
  }

  function openMatboardCatalog(layerIndex: number) {
    setMatboardLayerEditIndex(layerIndex);
    setMatboardModalOpen(true);
    void loadMatboardCatalog();
  }

  function onPickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }
    setPhotoUrl(null);
  }

  const allCatalogItems = useMemo(() => {
    const categories: FrameCategory[] = ["wood", "plastic", "aluminum"];
    const merged: FrameCatalogItem[] = [];
    for (const c of categories) {
      const list = catalogCacheRef.current[c];
      if (list && list.length > 0) merged.push(...list);
    }
    if (merged.length === 0) return catalog;
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.sku)) return false;
      seen.add(item.sku);
      return true;
    });
  }, [catalog, catalogCacheVersion]);
  const selectedFrame = useMemo(
    () => catalog.find((c) => c.sku === selectedSku) ?? allCatalogItems.find((c) => c.sku === selectedSku) ?? null,
    [catalog, allCatalogItems, selectedSku]
  );

  /** Один запрос на сервер: перебор URL из БД, локальных файлов и bi/{sku}t.jpg — иначе новые артикулы часто дают 404 по одному пути. */
  const framePreviewResolvedUrl = useMemo(() => {
    if (selectedFrame) return getFrameTextureResolvedSrc(selectedFrame);
    const sku = (selectedSku || catalog[0]?.sku || "").trim();
    return sku ? getFrameTextureResolvedSrc({ sku }) : undefined;
  }, [selectedFrame, selectedSku, catalog]);

  function goToOrder() {
    if (!result) return;
    const finishingNameForConfig =
      finishingId.trim() && materials.finishings?.length
        ? materials.finishings.find((x) => x.id === finishingId)?.name?.trim() ?? ""
        : "";
    const glassNameForConfig = materials.glass.find((g) => g.id === glassType)?.name?.trim() ?? "";
    const backingNameForConfig = materials.backing.find((b) => b.id === backingType)?.name?.trim() ?? "";
    const matboardLayersForConfig = matboardLayers.map((l) => {
      const name = matboardCatalog.find((m) => m.sku === l.sku)?.name?.trim();
      return { sku: l.sku, marginMm: l.marginMm, ...(name ? { name } : {}) };
    });
    const fq = Math.max(1, Math.min(500, Math.floor(Number(frameQuantity)) || 1));
    const configBase: Record<string, unknown> = {
      ...form,
      quantity: fq,
      frameLayers: selectedFrameLayers.map((f) => ({
        sku: f.sku,
        profileWidthMm: Number(f.widthMm ?? 40) || 40,
        pricePerMeter: f.retailPriceMeter,
        wasteCoeff: form.frameWasteCoeff
      })),
      withMatboard,
      useMatboard: withMatboard,
      matboardLayers: matboardLayersForConfig,
      matboardWidthMm: matboardLayers[0]?.marginMm ?? 0,
      frameProfileWidthMm,
      glassType,
      glassId: glassType,
      ...(glassNameForConfig ? { glassName: glassNameForConfig } : {}),
      backingType,
      backingId: backingType,
      ...(backingNameForConfig ? { backingName: backingNameForConfig } : {}),
      hangerId: hangerId || undefined,
      ...(hangerId.trim() && materials.hangers
        ? (() => {
            const n = materials.hangers!.find((h) => h.id === hangerId)?.name?.trim();
            return n ? { hangerName: n } : {};
          })()
        : {}),
      subframeId: subframeId || undefined,
      ...(subframeId.trim() && materials.subframes
        ? (() => {
            const n = materials.subframes!.find((h) => h.id === subframeId)?.name?.trim();
            return n ? { subframeName: n } : {};
          })()
        : {}),
      finishingId: finishingId || undefined,
      ...(finishingNameForConfig ? { finishingName: finishingNameForConfig } : {}),
      assemblyProductId: assemblyProductId || undefined,
      ...(assemblyProductId.trim() && materials.assemblyProducts
        ? (() => {
            const n = materials.assemblyProducts!.find((h) => h.id === assemblyProductId)?.name?.trim();
            return n ? { assemblyProductName: n } : {};
          })()
        : {}),
      standLegId: standLegId || undefined,
      ...(standLegId.trim() && materials.standLegs
        ? (() => {
            const n = materials.standLegs!.find((h) => h.id === standLegId)?.name?.trim();
            return n ? { standLegName: n } : {};
          })()
        : {}),
      promoCode,
      selectedSku,
      selectedMatboardSku: matboardLayers[0]?.sku ?? "",
      assemblyPrice: pricingRules.assemblyPrice,
      assembly: result.assembly,
      frame: result.frame,
      matboard: result.matboard,
      glass: result.glass,
      backing: result.backing
    };
    const outerDims = getOrderOuterDimensionsMm(configBase);
    const draft = {
      total: result.total,
      config: outerDims
        ? { ...configBase, outerWidthMm: outerDims.w, outerHeightMm: outerDims.h }
        : configBase
    };
    const unitLine = `Багет ${result.frame} · паспарту ${result.matboard} · стекло ${result.glass} · задник ${result.backing} · доп. ${accessoriesTotal} · сборка ${result.assembly} руб.`;
    const priceDetailLine =
      fq > 1
        ? `${unitLine} · ${fq} шт. · итого ${Math.round(result.total)} руб.`
        : `${unitLine} · итого ${Math.round(result.total)} руб.`;
    try {
      if (embed && onEmbedCheckout) {
        onEmbedCheckout({ total: draft.total, config: draft.config, priceDetailLine });
        return;
      }
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          { type: "YANAK_VISUAL_CHECKOUT", total: draft.total, config: draft.config, priceDetailLine },
          "*"
        );
        return;
      }
      sessionStorage.setItem("order-draft", JSON.stringify({ ...draft, priceDetailLine }));
      window.location.href = "/order";
    } catch {
      window.location.href = "/order";
    }
  }

  return (
    <main className={`app-main${embed ? " app-main--embed" : ""}`}>
      <div className="app-grid">
        <Card className="card-inner">
          <div className="file-row">
            <div className="field">
              <span className="field-label">Изображение</span>
              <input className="input" type="file" accept="image/*" onChange={onPickPhoto} />
            </div>
            {photoUrl ? (
              <button type="button" className="btn-link" onClick={removePhoto}>
                Убрать фото
              </button>
            ) : null}
          </div>

          {catalogLoading && catalog.length === 0 ? (
            <div className="constructor-frame-preview-shell" style={{ marginInline: "auto" }}>
              <div className="constructor-frame-preview-viewport" aria-hidden />
              <p className="hint" style={{ margin: "8px 0 0", textAlign: "center" }}>
                Загрузка каталога…
              </p>
            </div>
          ) : !catalogLoading && catalog.length === 0 ? (
            <div style={{ textAlign: "center" }}>
              <p className="error-text" style={{ margin: 0, maxWidth: 320, marginInline: "auto" }}>
                {catalogError || "Каталог недоступен."}
              </p>
              <button
                type="button"
                onClick={() => void loadCatalog(frameCategory, { bypassCache: true })}
                className="btn btn-muted"
                style={{ marginTop: 12 }}
              >
                Повторить
              </button>
            </div>
          ) : (
            <FramePreview
              sku={selectedSku || catalog[0]?.sku || "0"}
              previewImageUrl={framePreviewResolvedUrl}
              imageUrl={undefined}
              imageWidthMm={form.widthMm}
              imageHeightMm={form.heightMm}
              frameProfileWidthMm={frameTotalProfileWidthMm}
              frameLayerWidthsMm={previewFrameLayerWidths}
              frameLayerTextureUrls={previewFrameLayerTextures}
              matBorderMm={matboardTotalBorderMm}
              matboardLayerMarginsMm={previewMatboardLayerMargins}
              matboardImageUrls={withMatboard ? previewMatboardImageUrls : undefined}
              matboardImageUrl={
                withMatboard
                  ? (previewMatboardItem?.imageUrl ?? matboardCatalog[0]?.imageUrl)
                  : undefined
              }
              photoUrl={photoUrl}
              withMatboard={withMatboard}
              embed={embed}
            />
          )}

          <h2 className="card-heading" style={{ marginTop: 12 }}>
            Превью
          </h2>

          {selectedFrame ? (
            <div className="sku-line">
              Выбранный артикул: <strong>{selectedFrame.sku}</strong>
            </div>
          ) : null}
        </Card>

        <Card className="card-inner">
          <h2 className="card-heading">Расчёт заказа</h2>

          <div className="form-stack">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="w">
                  Ширина, мм
                </label>
                <MmStepperInput
                  id="w"
                  value={form.widthMm}
                  min={30}
                  max={5000}
                  step={1}
                  stepCoarse={10}
                  onValueChange={(n) => setForm((prev) => ({ ...prev, widthMm: n }))}
                />
              </div>
              <button
                type="button"
                className="btn btn-muted"
                onClick={() => setForm((prev) => ({ ...prev, widthMm: prev.heightMm, heightMm: prev.widthMm }))}
                title="Поменять ширину и высоту"
                style={{ flexShrink: 0, width: 44, height: 44, padding: 0 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3l4 4-4 4" />
                  <path d="M20 7H4" />
                  <path d="M8 21l-4-4 4-4" />
                  <path d="M4 17h16" />
                </svg>
              </button>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="h">
                  Высота, мм
                </label>
                <MmStepperInput
                  id="h"
                  value={form.heightMm}
                  min={30}
                  max={5000}
                  step={1}
                  stepCoarse={10}
                  onValueChange={(n) => setForm((prev) => ({ ...prev, heightMm: n }))}
                />
              </div>
            </div>
            <p className="field-hint">Стрелки ↑↓: ±1 мм · Shift+↑↓: ±10 мм · или кнопки справа</p>

            <div className="field" style={{ maxWidth: 200 }}>
              <label className="field-label" htmlFor="frame-qty">
                Количество рамок (одинаковых)
              </label>
              <input
                id="frame-qty"
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={frameQuantity}
                onChange={(e) => {
                  const v = Math.floor(Number(e.target.value));
                  setFrameQuantity(Number.isFinite(v) ? Math.max(1, Math.min(500, v)) : 1);
                }}
              />
            </div>

            <div className="calc-section-block">
              <div className="calc-section-block__title">Багет</div>
              <div className="calc-option-row calc-option-row--layer-toggles">
                <span className="calc-option-row__label">{compactChips ? "Профиль" : "Слои профиля"}</span>
                <div className="calc-chip-row calc-chip-row--frame-layers calc-chip-row--layer-pills" role="group" aria-label="Слоёв багета (багет в багете)">
                  {([1, 2, 3] as const).map((n) => (
                    <button
                      key={`frame-layer-${n}`}
                      type="button"
                      className={`calc-chip ${frameLayers.length === n ? "calc-chip--active" : ""}`}
                      onClick={() => applyFrameLayerCount(n)}
                      title={n === 1 ? "Один профиль по периметру" : `${n} вложенных профиля — не число рам в заказе`}
                    >
                      {compactChips ? String(n) : n === 1 ? "1 слой" : `${n} слоя`}
                    </button>
                  ))}
                </div>
              </div>
              {frameLayers.length > 1 ? (
                <div className="calc-matboard-layers">
                  <button type="button" className="btn btn-muted" onClick={toggleFrameLayerOrder}>
                    Поменять позицию багета
                  </button>
                  {frameLayers.map((layer, idx) => (
                    <div key={`frame-layer-row-${idx}`} className="calc-matboard-layer">
                      <div className="calc-matboard-layer__head">
                        <span className="calc-matboard-layer__title">Слой багета {idx + 1}</span>
                        <button type="button" className="btn btn-dark btn--compact" onClick={() => openFrameCatalog(idx)}>
                          Каталог
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                        <select
                          className="select"
                          style={{ flex: 1 }}
                          value={layer.sku}
                          onChange={(e) => {
                            const sku = e.target.value;
                            setFrameLayers((prev) => {
                              const next = [...prev];
                              if (next[idx]) next[idx] = { sku };
                              return next;
                            });
                            if (idx === 0) handleSelectSku(sku);
                          }}
                        >
                          {allCatalogItems.map((item) => (
                            <option key={`${idx}-${item.sku}`} value={item.sku}>
                              {item.sku} — {item.retailPriceMeter} руб./м — {item.widthMm} мм
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {frameLayers.length === 1 ? (
                <>
                  <div className="field" style={{ marginTop: 4 }}>
                    <label className="field-label" htmlFor="cat">
                      Категория багета
                    </label>
                    <select id="cat" className="select" value={frameCategory} onChange={(e) => handleChangeCategory(e.target.value as FrameCategory)}>
                      <option value="wood">Дерево</option>
                      <option value="plastic">Пластик</option>
                      <option value="aluminum">Алюминий</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="sku">
                      Профиль (артикул)
                    </label>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
                      <select
                        id="sku"
                        className="select"
                        style={{ flex: "1 1 200px", minWidth: 0 }}
                        value={selectedSku}
                        onChange={(e) => handleSelectSku(e.target.value)}
                        disabled={catalogLoading || catalog.length === 0}
                      >
                        {catalog.map((item) => (
                          <option key={item.sku} value={item.sku}>
                            {item.sku} — {item.retailPriceMeter} руб./м — {item.widthMm} мм
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-dark"
                        style={{ flex: "0 0 auto" }}
                        onClick={() => {
                          setCatalogModalOpen(true);
                          if (!embed) void prefetchCatalogCategories();
                        }}
                      >
                        Каталог
                      </button>
                    </div>
                    {catalogLoading || !bootstrapReady ? <span className="hint">Загрузка…</span> : null}
                    {catalogError ? <span className="error-text">{catalogError}</span> : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="calc-section-block">
              <div className="calc-section-block__title">Паспарту</div>
              <div className="calc-option-row calc-option-row--layer-toggles">
                <span className="calc-option-row__label">{compactChips ? "Кол-во" : "Слои"}</span>
                <div className="calc-chip-row calc-chip-row--matboard-layers calc-chip-row--layer-pills" role="group" aria-label="Слоёв паспарту">
                  {([0, 1, 2, 3] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`calc-chip ${matboardLayers.length === n ? "calc-chip--active" : ""}`}
                      onClick={() => {
                        applyMatboardLayerCount(n);
                        if (n > 0) void loadMatboardCatalog();
                      }}
                      title={
                        n === 0
                          ? "Без паспарту"
                          : n === 1
                            ? "Один слой паспарту"
                            : `${n} слоя паспарту`
                      }
                    >
                      {n === 0 ? "НЕТ" : compactChips ? String(n) : n === 1 ? "1 слой" : `${n} слоя`}
                    </button>
                  ))}
                </div>
              </div>
              {withMatboard ? (
                <div className="calc-matboard-layers">
                  {matboardLayers.map((layer, idx) => {
                    const layerItem = matboardCatalog.find((m) => m.sku === layer.sku);
                    return (
                      <div key={idx} className="calc-matboard-layer">
                        <div className="calc-matboard-layer__head">
                          <span className="calc-matboard-layer__title">
                            Слой {idx + 1}
                            {idx === 0 ? " (к стеклу)" : ""}
                          </span>
                          <button type="button" className="btn btn-dark btn--compact" onClick={() => openMatboardCatalog(idx)}>
                            Каталог
                          </button>
                        </div>
                        {layerItem ? (
                          <div className="calc-matboard-layer__sku">
                            Арт. {layerItem.sku} — {layerItem.name || "—"} · {layerItem.pricePerM2} руб./м²
                          </div>
                        ) : (
                          <div className="calc-matboard-layer__sku calc-matboard-layer__sku--muted">Не выбран</div>
                        )}
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label className="field-label" htmlFor={`mat-margin-${idx}`}>
                            Поле слоя, мм
                          </label>
                          <input
                            id={`mat-margin-${idx}`}
                            className="input"
                            inputMode="numeric"
                            value={layer.marginMm}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setMatboardLayers((prev) => {
                                const next = [...prev];
                                if (next[idx]) next[idx] = { ...next[idx], marginMm: Number.isFinite(v) ? Math.max(0, v) : DEFAULT_MATBOARD_MARGIN_MM };
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="field" style={{ marginTop: 6 }}>
              <label className="field-label" htmlFor="subframe">
                Подрамник
              </label>
              <select id="subframe" className="select" value={subframeId} onChange={(e) => setSubframeId(e.target.value)}>
                <option value="">Нет</option>
                {(materials.subframes ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {accOptionLabel(h, openingPerimeterM)}
                  </option>
                ))}
              </select>
            </div>

            <div className="calc-materials-section">
              <div className="calc-materials-section__title">Дополнительные материалы</div>
              <div className="calc-materials-grid">
                <div className="field calc-materials-field">
                  <label className="field-label" htmlFor="glass">
                    Стекло
                  </label>
                  <select id="glass" className="select" value={glassType} onChange={(e) => setGlassType(e.target.value)}>
                    {materials.glass.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({Number(g.pricePerM2 ?? 0).toLocaleString("ru-RU")} руб./м²)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field calc-materials-field">
                  <label className="field-label" htmlFor="back">
                    Задник
                  </label>
                  <select id="back" className="select" value={backingType} onChange={(e) => setBackingType(e.target.value)}>
                    {materials.backing.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.pricePerM2 != null
                          ? ` (${Number(b.pricePerM2).toLocaleString("ru-RU")} руб./м²)`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field calc-materials-field">
                  <label className="field-label" htmlFor="hanger">
                    Подвес
                  </label>
                  <select id="hanger" className="select" value={hangerId} onChange={(e) => setHangerId(e.target.value)}>
                    <option value="">Нет</option>
                    {(materials.hangers ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({Number(h.price ?? 0).toLocaleString("ru-RU")} руб.)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field calc-materials-field">
                  <label className="field-label" htmlFor="finishing">
                    Изделие
                  </label>
                  <select id="finishing" className="select" value={finishingId} onChange={(e) => setFinishingId(e.target.value)}>
                    <option value="">Нет</option>
                    {(materials.finishings ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {accOptionLabel(h, openingPerimeterM)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field calc-materials-field">
                  <label className="field-label" htmlFor="assembly-prod">
                    По оформлению
                  </label>
                  <select
                    id="assembly-prod"
                    className="select"
                    value={assemblyProductId}
                    onChange={(e) => setAssemblyProductId(e.target.value)}
                  >
                    <option value="">Нет</option>
                    {(materials.assemblyProducts ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {accOptionLabel(h, openingPerimeterM)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field calc-materials-field">
                  <label className="field-label" htmlFor="stand-leg">
                    Ножка
                  </label>
                  <select id="stand-leg" className="select" value={standLegId} onChange={(e) => setStandLegId(e.target.value)}>
                    <option value="">Нет</option>
                    {(materials.standLegs ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {accOptionLabel(h, openingPerimeterM)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="promo">
                Промокод
              </label>
              <input id="promo" className="input" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          {result ? (
            <>
              <div className="price-box">
                <div className="price-total">{Math.round(result.total)} руб.</div>
                <span className="price-detail">
                  Багет {result.frame} · паспарту {result.matboard} · стекло {result.glass} · задник {result.backing} · доп.{" "}
                  {accessoriesTotal} · сборка {result.assembly} руб.
                </span>
              </div>
              <button type="button" className="btn btn-accent" style={{ marginTop: 10, minHeight: 42, width: "100%" }} onClick={goToOrder}>
                Оформить заказ
              </button>
            </>
          ) : null}
        </Card>
      </div>

      {catalogModalOpen ? (
        <CatalogModal
          open={catalogModalOpen}
          onClose={() => setCatalogModalOpen(false)}
          category={frameCategory}
          onCategoryChange={(c) => {
            setFrameCategory(c);
            void loadCatalog(c);
          }}
          items={catalog}
          allItems={allCatalogItems}
          loading={catalogLoading}
          error={catalogError}
          selectedSku={selectedSku}
          onSelect={(item: FrameCatalogItem) => {
            const idx = Math.max(0, frameLayerEditIndex);
            setFrameLayers((prev) => {
              const next = prev.length > 0 ? [...prev] : [{ sku: item.sku }];
              if (next[idx]) next[idx] = { sku: item.sku };
              return next;
            });
            if (idx === 0) setSelectedSku(item.sku);
            setFrameCategory(item.category);
            const categoryList = catalogCacheRef.current[item.category];
            if (categoryList) {
              setCatalog(categoryList);
            } else {
              void loadCatalog(item.category);
            }
            setForm((prev) => ({ ...prev, framePricePerMeter: item.retailPriceMeter }));
          }}
        />
      ) : null}

      {matboardModalOpen ? (
        <MatboardCatalogModal
          open={matboardModalOpen}
          onClose={() => setMatboardModalOpen(false)}
          items={matboardCatalog}
          loading={matboardCatalogLoading}
          error={matboardCatalogError}
          selectedSku={matboardLayers[matboardLayerEditIndex]?.sku ?? ""}
          onSelect={(item) => {
            const idx = matboardLayerEditIndex;
            setMatboardLayers((prev) => {
              const next = [...prev];
              if (next[idx]) next[idx] = { ...next[idx], sku: item.sku };
              return next;
            });
          }}
        />
      ) : null}
    </main>
  );
}
