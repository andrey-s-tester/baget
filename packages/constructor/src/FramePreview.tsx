"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { remoteImageViaProxy } from "./lib/image-proxy-url";

import "./constructor.css";

/**
 * Превью рамы — всё рисуется на одном canvas: рама с текстурой, паспарту, фото.
 * При смене багета — анимация в стиле змейки: старая рама «уползает», новая «наползает».
 */

const FALLBACK_COLOR = "#9a7b52";
const TRANSITION_DURATION_MS = 520;
const EASE_OUT_CUBIC = (t: number) => 1 - (1 - t) ** 3;

/** Опасити i-й полосы при «уползании» старой рамы (progress 0→1) */
function stripOpacityOut(progress: number, stripIndex: number): number {
  const delay = stripIndex * 0.12;
  const window = 0.28;
  return Math.max(0, 1 - (progress - delay) / window);
}

/** Опасити i-й полосы при «наползании» новой рамы */
function stripOpacityIn(progress: number, stripIndex: number): number {
  const delay = 0.08 + stripIndex * 0.12;
  const window = 0.28;
  return Math.min(1, Math.max(0, (progress - delay) / window));
}
const PREVIEW_SIZE_DEFAULT = 1400;
/** Во встраивании (iframe админки) меньше внутреннее разрешение — быстрее декодирование JPEG и отрисовка canvas */
const PREVIEW_SIZE_EMBED = 900;
/**
 * Верхняя граница ширины оболочки превью (не «базовая ширина рамки»).
 * Раньше 710 → 960; фиксированный 960px конфликтовал с широкой колонкой сетки и aspect-ratio (мм),
 * когда колонка шире — превью искусственно уже колонки.
 */
const PREVIEW_VIEWPORT_MAX_WIDTH_PX = 1200;

/**
 * Ограничение высоты вьюпорта в embed — то же по смыслу, что inline `maxHeight` у viewportChrome
 * (`min(82dvh, min(1200px, 92vh))`). Без этого в CSS: width 100% + aspect-ratio + max-height
 * сжимают ширину вьюпорта для «высоких» рамок, а estimate считает ширину по shell → скачок при measure.
 */
function embedViewportMaxHeightPx(winH: number): number {
  return Math.min(winH * 0.82, 1200, winH * 0.92);
}

/**
 * Реальные размеры блока .constructor-frame-preview-viewport (сцена 16:9 + max-height из constructor.css).
 * Должны совпадать с оценкой до measure(), иначе рамка перескакивает после первого layout.
 */
function sceneViewportSizePx(shellW: number, winW: number, winH: number, embed: boolean): { sceneW: number; sceneH: number } {
  const narrow = winW <= 540;
  let maxSceneH: number;
  if (embed) {
    maxSceneH = Math.min(embedViewportMaxHeightPx(winH), narrow ? winH * 0.88 : winH * 0.92);
  } else {
    maxSceneH = narrow ? Math.min(winH * 0.88, winH * 1) : Math.min(winH * 0.92, winH * 1);
  }
  let sceneW = shellW;
  let sceneH = (sceneW * 9) / 16;
  if (sceneH > maxSceneH) {
    sceneH = maxSceneH;
    sceneW = (sceneH * 16) / 9;
  }
  return { sceneW, sceneH };
}

/**
 * Оценка viewInner до measure(): ширина колонки как в app-grid + сцена 16:9 и max-height (как в CSS).
 * Не опираемся на мм рамы — иначе первый кадр не совпадает с clientWidth/Height вьюпорта.
 * SSR: те же формулы с фиктивным окном.
 */
function viewInnerFromWindowSize(
  _outerWmm: number,
  _outerHmm: number,
  embed: boolean,
  winW: number,
  winH: number
): { w: number; h: number } {
  const mainPadX = embed ? 24 : 32;
  const contentW = Math.max(0, winW - mainPadX);
  const twoCol = winW > 960;
  const gridGap = 16;
  const cardPadX = 40;
  const colOuter = twoCol ? Math.round((contentW - gridGap) * (3 / 5)) : Math.round(contentW);
  const shellCap = Math.min(PREVIEW_VIEWPORT_MAX_WIDTH_PX, Math.round(winW * 0.96));
  const shellW = Math.min(shellCap, Math.max(280, colOuter - cardPadX));

  const { sceneW, sceneH } = sceneViewportSizePx(shellW, winW, winH, embed);

  /* Должны совпадать по сумме с padding вьюпорта embed (фикс. px — без clamp/vmin, ломали расчёт сцены) */
  const padXTot = embed ? 24 : 52;
  const padYTot = embed ? 20 : 56;
  const w = Math.max(1, Math.round(sceneW - padXTot));
  const h = Math.max(1, Math.round(sceneH - padYTot));
  return { w, h };
}

/** Только SSR-safe размеры — реальное окно подставляет useLayoutEffect (measure). Нельзя читать window в initializer useState. */
function estimateViewInnerPx(outerWmm: number, outerHmm: number, embed: boolean): { w: number; h: number } {
  return viewInnerFromWindowSize(outerWmm, outerHmm, embed, 1280, 800);
}

/** Небольшой запас под размерные линии у рамки (уже внутри padding блока) */
const PREVIEW_DIM_EXTRA_W = 16;
const PREVIEW_DIM_EXTRA_H = 12;
/** Нижний предел масштаба — только чтобы не уходить в ноль при численных краях */
const FIT_FLOOR = 0.05;
/** Во встраивании админки при ошибочно заниженном viewInner fit упирался в 0.05 → ~45px по ширине — «невидимая» рама */
const FIT_FLOOR_EMBED = 0.14;
const FIT_CAP = 1;
const PREVIEW_IMAGE_BASE = "https://bagetnaya-masterskaya.com/bi";

const overlap = 2;

/** Ширина колонки под вертикальный размер (выровнять с верхней горизонтальной линией) */
const PREVIEW_DIM_V_COL = 44;

/** Горизонтальная размерная линия «Снаружи» со стрелками к краям рамки */
function PreviewDimH({ mm }: { mm: number }) {
  const rounded = Math.round(mm);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color: "#475569",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.2
      }}
    >
      <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden style={{ flexShrink: 0, display: "block" }}>
        <polygon points="12,5 0,0 0,10" fill="currentColor" />
      </svg>
      <div style={{ flex: 1, height: 1, background: "#94a3b8" }} />
      <span style={{ whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 700 }}>Снаружи</span>
        <span style={{ fontWeight: 600, color: "#64748b" }}> · </span>
        {rounded} мм
      </span>
      <div style={{ flex: 1, height: 1, background: "#94a3b8" }} />
      <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden style={{ flexShrink: 0, display: "block" }}>
        <polygon points="0,5 12,0 12,10" fill="currentColor" />
      </svg>
    </div>
  );
}

/** Вертикальная размерная линия высоты снаружи со стрелками */
function PreviewDimV({ mm }: { mm: number }) {
  const rounded = Math.round(mm);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minWidth: PREVIEW_DIM_V_COL,
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: "#475569",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.2
      }}
    >
      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden style={{ flexShrink: 0, display: "block" }}>
        <polygon points="5,0 0,12 10,12" fill="currentColor" />
      </svg>
      <div style={{ flex: 1, width: 1, background: "#94a3b8", minHeight: 4 }} />
      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>{rounded} мм</span>
      <div style={{ flex: 1, width: 1, background: "#94a3b8", minHeight: 4 }} />
      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden style={{ flexShrink: 0, display: "block" }}>
        <polygon points="5,12 0,0 10,0" fill="currentColor" />
      </svg>
    </div>
  );
}

/**
 * Масштаб текстуры: толщина профиля в px и период зеркального тайла (2×ширина JPG) — с округлением,
 * чтобы границы тайлов попадали в целые пиксели (иначе браузер даёт тонкие «швы»).
 */
function snapFrameTextureScale(edgePx: number, img: HTMLImageElement): number {
  const nw = img.naturalWidth || 0;
  const nh = img.naturalHeight || 1;
  let s = Math.max(0.1, edgePx / nh);
  if (nw >= 2) {
    const period = 2 * nw * s;
    if (period >= 1) s *= Math.round(period) / period;
  }
  const thick = nh * s;
  if (thick >= 1) s *= Math.max(1, Math.round(thick)) / thick;
  if (nw >= 2) {
    const period2 = 2 * nw * s;
    if (period2 >= 1) s *= Math.round(period2) / period2;
  }
  return s;
}

/**
 * Два прохода паттерна со сдвигом на полпериода (nw в координатах тайла) — усредняет остаточный стык.
 */
function fillStripPatternTwice(ctx: CanvasRenderingContext2D, pat: CanvasPattern, img: HTMLImageElement, scale: number) {
  ctx.scale(scale, scale);
  ctx.fillStyle = pat;
  ctx.fillRect(-5000, -5000, 20000, 20000);
  const nw = img.naturalWidth || 0;
  if (nw >= 2) {
    const a = 0.24;
    ctx.globalAlpha = a;
    ctx.translate(nw, 0);
    ctx.fillRect(-5000, -5000, 20000, 20000);
    ctx.globalAlpha = 1;
  }
}

/**
 * Тайлинг `…t.jpg` по длинине профиля даёт вертикальные швы, если края файла не seamless.
 * Дублируем полосу как [оригинал | зеркало] и повторяем период 2×ширина — стыки часто менее заметны.
 */
function createMirrorRepeatPattern(ctx: CanvasRenderingContext2D, img: HTMLImageElement): CanvasPattern | null {
  const nw = img.naturalWidth || 0;
  const nh = img.naturalHeight || 0;
  if (nw < 2 || nh < 1) {
    try {
      return ctx.createPattern(img, "repeat");
    } catch {
      return null;
    }
  }
  const c = document.createElement("canvas");
  c.width = nw * 2;
  c.height = nh;
  const pctx = c.getContext("2d", { alpha: false });
  if (!pctx) {
    try {
      return ctx.createPattern(img, "repeat");
    } catch {
      return null;
    }
  }
  pctx.imageSmoothingEnabled = true;
  pctx.imageSmoothingQuality = "high";
  pctx.drawImage(img, 0, 0);
  pctx.save();
  pctx.translate(2 * nw, 0);
  pctx.scale(-1, 1);
  pctx.drawImage(img, 0, 0);
  pctx.restore();
  try {
    return ctx.createPattern(c, "repeat");
  } catch {
    return null;
  }
}

/** strict=1: proxy returns 4xx/5xx on failure so texture load can fall back (default 200+SVG breaks canvas). */
function toProxySrc(src: string): string {
  return remoteImageViaProxy(src, { strict: true });
}

function getMatboardSources(src?: string): string[] {
  if (!src) return [];
  const trimmed = src.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith("http")) return [trimmed];
  return [toProxySrc(trimmed), trimmed];
}

const stripsFromRect = (w: number, h: number, e: number): [number, number][][] => [
  [
    [0, 0],
    [w, 0],
    [w - e + overlap, e],
    [e - overlap, e]
  ],
  [
    [e - overlap, h - e],
    [w - e + overlap, h - e],
    [w, h],
    [0, h]
  ],
  [
    [0, 0],
    [e, e - overlap],
    [e, h - e + overlap],
    [0, h]
  ],
  [
    [w - e, e - overlap],
    [w, 0],
    [w, h],
    [w - e, h - e + overlap]
  ]
];

export function FramePreview({
  sku,
  previewImageUrl,
  imageUrl,
  imageWidthMm,
  imageHeightMm,
  frameProfileWidthMm,
  frameLayerWidthsMm,
  frameLayerTextureUrls,
  matBorderMm,
  matboardLayerMarginsMm,
  matboardImageUrl,
  matboardImageUrls,
  photoUrl,
  withMatboard,
  embed = false
}: {
  sku: string;
  previewImageUrl?: string;
  imageUrl?: string;
  imageWidthMm: number;
  imageHeightMm: number;
  frameProfileWidthMm: number;
  frameLayerWidthsMm?: number[];
  frameLayerTextureUrls?: string[];
  matBorderMm: number;
  matboardLayerMarginsMm?: number[];
  /** URL изображения паспарту из каталога — текстура (для всех слоёв, если matboardImageUrls нет) */
  matboardImageUrl?: string;
  matboardImageUrls?: string[];
  photoUrl: string | null;
  withMatboard: boolean;
  /** Упрощённый превью для /embed — меньше нагрузка на GPU/память */
  embed?: boolean;
}) {
  const refCanvasMax = embed ? PREVIEW_SIZE_EMBED : PREVIEW_SIZE_DEFAULT;
  const matLayersMm = useMemo(() => {
    if (!withMatboard) return [];
    if (Array.isArray(matboardLayerMarginsMm) && matboardLayerMarginsMm.length > 0) {
      return matboardLayerMarginsMm.map((v) => Math.max(0, Number(v) || 0)).filter((v) => v > 0);
    }
    return matBorderMm > 0 ? [matBorderMm] : [];
  }, [withMatboard, matboardLayerMarginsMm, matBorderMm]);
  const mat = matLayersMm.reduce((sum, v) => sum + v, 0);

  const matUrlsForLayers = useMemo((): string[] => {
    const n = matLayersMm.length;
    if (n === 0) return [];
    const trimmedList = (matboardImageUrls ?? [])
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter((u) => u.length > 0);
    if (trimmedList.length > 0) {
      return Array.from({ length: n }, (_, i) => trimmedList[Math.min(i, trimmedList.length - 1)]!);
    }
    const one = typeof matboardImageUrl === "string" ? matboardImageUrl.trim() : "";
    if (one) return Array.from({ length: n }, () => one);
    return [];
  }, [matLayersMm.length, matboardImageUrls, matboardImageUrl]);

  const matUrlsKey = matUrlsForLayers.join("\0");

  const frameLayersMm = useMemo(() => {
    const fromProps = (frameLayerWidthsMm ?? []).map((v) => Math.max(0, Number(v) || 0)).filter((v) => v > 0);
    return fromProps.length > 0 ? fromProps : [Math.max(0, frameProfileWidthMm)];
  }, [frameLayerWidthsMm, frameProfileWidthMm]);
  const fw = frameLayersMm.reduce((sum, v) => sum + v, 0);
  const outerW = imageWidthMm + 2 * mat + 2 * fw;
  const outerH = imageHeightMm + 2 * mat + 2 * fw;
  const outerMmRef = useRef({ w: outerW, h: outerH });
  outerMmRef.current = { w: outerW, h: outerH };

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Внутренние размеры области превью (контент под padding) — до первого measure */
  const [viewInner, setViewInner] = useState(() => estimateViewInnerPx(outerW, outerH, embed));
  const [texReady, setTexReady] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const [matBoardImgs, setMatBoardImgs] = useState<(HTMLImageElement | null)[]>([]);
  const [matBoardReady, setMatBoardReady] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const texImgRef = useRef<HTMLImageElement | null>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);
  const [frameLayerImgs, setFrameLayerImgs] = useState<(HTMLImageElement | null)[]>([]);
  const prevSkuRef = useRef<string | null>(null);
  const prevTexImgRef = useRef<HTMLImageElement | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [transitionId, setTransitionId] = useState(0);
  const rafRef = useRef<number>(0);

  const pickUrl = (u?: string | null) => {
    const t = typeof u === "string" ? u.trim() : "";
    return t.length > 0 ? t : undefined;
  };
  const textureSrc =
    pickUrl(previewImageUrl) ?? pickUrl(imageUrl) ?? `${PREVIEW_IMAGE_BASE}/${sku}t.jpg`;
  const fallbackSrc = `/baget-assets/${encodeURIComponent(sku)}t.jpg`;
  const srcToTry = textureSrc && !triedFallback ? textureSrc : fallbackSrc;
  const lastSkuRef = useRef(sku);

  useEffect(() => {
    if (lastSkuRef.current !== sku && texImgRef.current) {
      prevTexImgRef.current = texImgRef.current;
      prevSkuRef.current = lastSkuRef.current;
      lastSkuRef.current = sku;
      setTransitionProgress(0);
      setTransitionId((n) => n + 1);
    } else if (lastSkuRef.current !== sku) {
      lastSkuRef.current = sku;
    }
  }, [sku]);

  useEffect(() => {
    setTriedFallback(false);
    setTexReady(false);
    texImgRef.current = null;
  }, [textureSrc]);

  useEffect(() => {
    const urls = (frameLayerTextureUrls ?? []).filter((u) => typeof u === "string" && u.trim());
    if (urls.length === 0) {
      setFrameLayerImgs([]);
      return;
    }
    let cancelled = false;
    const imgs: (HTMLImageElement | null)[] = new Array(urls.length).fill(null);
    let done = 0;
    urls.forEach((src, idx) => {
      const img = new Image();
      img.crossOrigin = src.startsWith("http") ? "anonymous" : null;
      img.onload = () => {
        if (cancelled) return;
        imgs[idx] = img;
        done += 1;
        if (done === urls.length) setFrameLayerImgs([...imgs]);
      };
      img.onerror = () => {
        if (cancelled) return;
        done += 1;
        if (done === urls.length) setFrameLayerImgs([...imgs]);
      };
      img.src = toProxySrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [frameLayerTextureUrls]);

  useEffect(() => {
    if (!srcToTry) return;
    let cancelled = false;
    const tryLoad = (withCors: boolean) => {
      const img = new Image();
      const effectiveSrc = toProxySrc(srcToTry);
      img.crossOrigin = withCors && srcToTry.startsWith("http") ? "anonymous" : null;
      img.onload = () => {
        if (cancelled) return;
        texImgRef.current = img;
        setTexReady(true);
      };
      img.onerror = () => {
        if (cancelled) return;
        if (withCors && srcToTry.startsWith("http")) {
          // Some hosts do not provide CORS headers; retry without crossOrigin.
          tryLoad(false);
          return;
        }
        if (fallbackSrc && srcToTry === textureSrc && !triedFallback) setTriedFallback(true);
        else setTexReady(false);
      };
      img.src = effectiveSrc;
    };
    tryLoad(true);
    return () => {
      cancelled = true;
    };
  }, [srcToTry, textureSrc, fallbackSrc, triedFallback]);

  useEffect(() => {
    if (!photoUrl) {
      photoImgRef.current = null;
      setPhotoReady(false);
      return;
    }
    setPhotoReady(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      photoImgRef.current = img;
      setPhotoReady(true);
    };
    img.onerror = () => {
      photoImgRef.current = null;
      setPhotoReady(false);
    };
    img.src = photoUrl;
  }, [photoUrl]);

  useEffect(() => {
    if (transitionId === 0) return;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = t - start;
      const raw = Math.min(1, elapsed / TRANSITION_DURATION_MS);
      const eased = EASE_OUT_CUBIC(raw);
      setTransitionProgress(eased);
      if (eased < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTexImgRef.current = null;
        prevSkuRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [transitionId]);

  useEffect(() => {
    if (matUrlsForLayers.length === 0) {
      setMatBoardImgs([]);
      setMatBoardReady(true);
      return;
    }
    let cancelled = false;
    setMatBoardReady(false);
    const n = matUrlsForLayers.length;
    const imgs: (HTMLImageElement | null)[] = new Array(n).fill(null);
    let done = 0;
    const finishOne = () => {
      done += 1;
      if (done === n && !cancelled) {
        setMatBoardImgs([...imgs]);
        setMatBoardReady(true);
      }
    };

    matUrlsForLayers.forEach((baseUrl, idx) => {
      const sources = getMatboardSources(baseUrl);
      const tryLoad = (si: number, withCors: boolean) => {
        if (cancelled) return;
        const src = sources[si];
        if (!src) {
          imgs[idx] = null;
          finishOne();
          return;
        }
        const img = new Image();
        img.crossOrigin = withCors && src.startsWith("http") ? "anonymous" : null;
        img.onload = () => {
          if (cancelled) return;
          imgs[idx] = img;
          finishOne();
        };
        img.onerror = () => {
          if (cancelled) return;
          if (withCors && src.startsWith("http")) {
            tryLoad(si, false);
            return;
          }
          tryLoad(si + 1, true);
        };
        img.src = src;
      };
      tryLoad(0, true);
    });

    return () => {
      cancelled = true;
    };
  }, [matUrlsKey, matUrlsForLayers.length]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let cancelled = false;
    let rafId = 0;
    let settleAttempts = 0;
    const measure = (settlingFirstLayout: boolean) => {
      if (cancelled) return;
      const cs = getComputedStyle(el);
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const shell = el.closest(".constructor-frame-preview-shell");
      let rawW = el.clientWidth;
      let rawH = el.clientHeight;
      /* embed: не полагаемся на clientHeight вьюпорта до стабильного layout (flex/grid) — та же формула, что в CSS и estimate */
      if (embed && shell instanceof HTMLElement && shell.clientWidth >= 48) {
        const sw = shell.clientWidth;
        const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
        const winH = typeof window !== "undefined" ? window.innerHeight : 800;
        const { sceneW, sceneH } = sceneViewportSizePx(sw, winW, winH, embed);
        rawW = sceneW;
        rawH = sceneH;
      } else if (rawW < 48 || rawH < 48) {
        if (shell instanceof HTMLElement && shell.clientWidth >= 48) {
          const sw = shell.clientWidth;
          const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
          const winH = typeof window !== "undefined" ? window.innerHeight : 800;
          const { sceneW, sceneH } = sceneViewportSizePx(sw, winW, winH, embed);
          rawW = sceneW;
          rawH = sceneH;
        }
      }
      const w = Math.max(1, Math.round(rawW - pl - pr));
      const h = Math.max(1, Math.round(rawH - pt - pb));
      if (
        settlingFirstLayout &&
        (w < 48 || h < 48) &&
        settleAttempts < 10
      ) {
        settleAttempts += 1;
        requestAnimationFrame(() => {
          if (!cancelled) measure(true);
        });
        return;
      }
      setViewInner((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!cancelled) measure(false);
      });
    };
    measure(true);
    /* Следующий кадр после layout (flex/grid, шрифты) — иначе первый measure часто шире финального */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) measure(false);
      });
    });

    const ro = new ResizeObserver(() => measure(false));
    ro.observe(el);
    const shell = el.closest(".constructor-frame-preview-shell");
    let roShell: ResizeObserver | null = null;
    if (shell instanceof HTMLElement) {
      roShell = new ResizeObserver(() => measure(false));
      roShell.observe(shell);
    }

    window.addEventListener("resize", schedule);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (vv) vv.addEventListener("resize", schedule);

    const remeasure = () => {
      if (!cancelled) measure(false);
    };
    const onLoad = () => remeasure();
    window.addEventListener("load", onLoad);
    if (document.readyState === "complete") {
      queueMicrotask(remeasure);
    }
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(remeasure);
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      roShell?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", onLoad);
      if (vv) vv.removeEventListener("resize", schedule);
    };
  }, [embed]);

  const { edgePx, frameLayerPx, matLayerPx, innerWpx, innerHpx, outerWpx, outerHpx, fit } = useMemo(() => {
    let sc = refCanvasMax / Math.max(outerW, outerH, 1);
    if (!Number.isFinite(sc)) sc = 0.4;

    const calc = (s: number) => {
      let eLayers = frameLayersMm.map((mm) => Math.max(1, Math.round(mm * s)));
      let e = eLayers.reduce((sum, v) => sum + v, 0);
      const mLayers = matLayersMm.map((mm) => Math.max(0, Math.round(mm * s)));
      const m = mLayers.reduce((sum, v) => sum + v, 0);
      const iw = Math.round(imageWidthMm * s);
      const ih = Math.round(imageHeightMm * s);
      let ow = iw + 2 * m + 2 * e;
      let oh = ih + 2 * m + 2 * e;
      const cap = Math.min(Math.floor(ow / 2) - 1, Math.floor(oh / 2) - 1);
      if (e > cap) {
        e = Math.max(1, cap);
        const prevSum = eLayers.reduce((sum, v) => sum + v, 0) || 1;
        const scaled = eLayers.map((v) => Math.max(1, Math.floor((v / prevSum) * e)));
        let scaledSum = scaled.reduce((sum, v) => sum + v, 0);
        let idx = 0;
        while (scaledSum < e) {
          scaled[idx % scaled.length] += 1;
          scaledSum += 1;
          idx += 1;
        }
        while (scaledSum > e) {
          const i = idx % scaled.length;
          if (scaled[i] > 1) {
            scaled[i] -= 1;
            scaledSum -= 1;
          }
          idx += 1;
        }
        eLayers = scaled;
      }
      ow = iw + 2 * m + 2 * e;
      oh = ih + 2 * m + 2 * e;
      return { edgePx: e, frameLayerPx: eLayers, matLayerPx: mLayers, innerWpx: iw, innerHpx: ih, outerWpx: ow, outerHpx: oh };
    };

    let d = calc(sc);
    const max = Math.max(d.outerWpx, d.outerHpx);
    const availW = Math.max(1, viewInner.w - PREVIEW_DIM_EXTRA_W);
    const availH = Math.max(1, viewInner.h - PREVIEW_DIM_EXTRA_H);
    const fitFloor = embed ? FIT_FLOOR_EMBED : FIT_FLOOR;
    const fitFromBox = (ow: number, oh: number) =>
      Math.min(FIT_CAP, Math.max(fitFloor, Math.min(availW / ow, availH / oh) * 0.99));
    if (max > refCanvasMax && max > 0) {
      sc *= (refCanvasMax - 1) / max;
      d = calc(sc);
      return { ...d, fit: fitFromBox(d.outerWpx, d.outerHpx) };
    }
    return { ...d, fit: fitFromBox(d.outerWpx, d.outerHpx) };
  }, [outerW, outerH, fw, frameLayersMm, matLayersMm, imageWidthMm, imageHeightMm, viewInner.w, viewInner.h, refCanvasMax, embed]);

  const dpr =
    typeof window !== "undefined"
      ? Math.min(embed ? 1.35 : 2, window.devicePixelRatio || 1)
      : 1;
  const w = Math.ceil(outerWpx * fit * dpr);
  const h = Math.ceil(outerHpx * fit * dpr);
  const e = Math.max(1, edgePx * fit * dpr);
  const strips = useMemo(() => stripsFromRect(w, h, e), [w, h, e]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || w < 1 || h < 1) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);

    const matLayerScaled = matLayerPx.map((px) => Math.max(0, Math.round(px * fit * dpr)));
    let innerLeft = e;
    let innerTop = e;
    let innerW = w - 2 * e;
    let innerH = h - 2 * e;
    const matPalette = ["#f2ebe0", "#efe6d8", "#e9e0d3", "#e4dbc9"];
    for (let i = 0; i < matLayerScaled.length; i++) {
      const layer = matLayerScaled[i];
      if (layer <= 0) continue;
      const matImg = matBoardReady ? matBoardImgs[i] : null;
      if (matImg && matImg.complete && matImg.naturalWidth > 0) {
        let pat: CanvasPattern | null = null;
        try {
          pat = ctx.createPattern(matImg, "repeat");
        } catch {
          pat = null;
        }
        ctx.fillStyle = pat ?? matPalette[i % matPalette.length];
      } else {
        ctx.fillStyle = matPalette[i % matPalette.length];
      }
      ctx.fillRect(innerLeft - overlap, innerTop - overlap, innerW + 2 * overlap, innerH + 2 * overlap);
      innerLeft += layer;
      innerTop += layer;
      innerW -= layer * 2;
      innerH -= layer * 2;
    }
    innerW = Math.max(1, innerW);
    innerH = Math.max(1, innerH);
    const imageW = innerWpx * fit * dpr;
    const imageH = innerHpx * fit * dpr;

    const drawFrameSolid = (opacity: number) => {
      if (opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(e, e, w - 2 * e, h - 2 * e);
      ctx.fillStyle = FALLBACK_COLOR;
      ctx.fill("evenodd");
      ctx.restore();
    };

    const drawFrameStrips = (
      img: HTMLImageElement,
      stripsData: [number, number][][],
      getStripOpacity: (idx: number) => number
    ) => {
      const scale = snapFrameTextureScale(e, img);
      const pat = createMirrorRepeatPattern(ctx, img);
      if (!pat) return drawFrameSolid(getStripOpacity(0));
      for (let idx = 0; idx < stripsData.length; idx++) {
        const opacity = getStripOpacity(idx);
        if (opacity <= 0) continue;
        const pts = stripsData[idx];
        if (!pts || pts.length < 3) continue;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.clip();
        if (idx === 1) {
          ctx.translate(0, h);
          ctx.scale(1, -1);
        } else if (idx === 2) {
          ctx.translate(0, h);
          ctx.rotate(-Math.PI / 2);
        } else if (idx === 3) {
          ctx.translate(w, 0);
          ctx.rotate(Math.PI / 2);
        }
        fillStripPatternTwice(ctx, pat, img, scale);
        ctx.restore();
      }
    };

    if (frameLayerPx.length > 1) {
      // Render each baguette layer with the same strip logic as single-frame mode.
      const scaledLayers = frameLayerPx.map((px) => Math.max(1, Math.round(px * fit * dpr)));
      let offset = 0;
      for (let i = 0; i < scaledLayers.length; i++) {
        const layer = scaledLayers[i];
        const layerW = Math.max(1, w - 2 * offset);
        const layerH = Math.max(1, h - 2 * offset);
        const layerStrips = stripsFromRect(layerW, layerH, layer);
        const img = frameLayerImgs[i] ?? texImgRef.current;
        if (img && img.naturalHeight > 0) {
          const scale = snapFrameTextureScale(layer, img);
          const pat = createMirrorRepeatPattern(ctx, img);
          if (pat) {
            for (let idx = 0; idx < layerStrips.length; idx++) {
              const pts = layerStrips[idx];
              if (!pts || pts.length < 3) continue;
              ctx.save();
              ctx.translate(offset, offset);
              ctx.beginPath();
              ctx.moveTo(pts[0][0], pts[0][1]);
              for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
              ctx.closePath();
              ctx.clip();
              if (idx === 1) {
                ctx.translate(0, layerH);
                ctx.scale(1, -1);
              } else if (idx === 2) {
                ctx.translate(0, layerH);
                ctx.rotate(-Math.PI / 2);
              } else if (idx === 3) {
                ctx.translate(layerW, 0);
                ctx.rotate(Math.PI / 2);
              }
              fillStripPatternTwice(ctx, pat, img, scale);
              ctx.restore();
            }
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.rect(offset, offset, layerW, layerH);
            ctx.rect(offset + layer, offset + layer, Math.max(1, layerW - 2 * layer), Math.max(1, layerH - 2 * layer));
            ctx.fillStyle = FALLBACK_COLOR;
            ctx.fill("evenodd");
            ctx.restore();
          }
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(offset, offset, layerW, layerH);
          ctx.rect(offset + layer, offset + layer, Math.max(1, layerW - 2 * layer), Math.max(1, layerH - 2 * layer));
          ctx.fillStyle = FALLBACK_COLOR;
          ctx.fill("evenodd");
          ctx.restore();
        }
        if (i < scaledLayers.length - 1) {
          const sep = offset + layer;
          const sepW = Math.max(1, w - 2 * sep);
          const sepH = Math.max(1, h - 2 * sep);
          ctx.save();
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
          ctx.strokeRect(sep + 0.5, sep + 0.5, Math.max(1, sepW - 1), Math.max(1, sepH - 1));
          ctx.restore();
        }
        offset += layer;
      }
    } else {
      const inTransition = transitionProgress < 1 && prevTexImgRef.current;
      const p = transitionProgress;
      if (inTransition && prevTexImgRef.current) {
        const prevImg = prevTexImgRef.current;
        drawFrameStrips(prevImg, strips, (i) => stripOpacityOut(p, i));
      }
      if (texReady && texImgRef.current) {
        const img = texImgRef.current;
        if (inTransition) {
          drawFrameStrips(img, strips, (i) => stripOpacityIn(p, i));
        } else {
          drawFrameStrips(img, strips, () => 1);
        }
      } else if (!inTransition) {
        drawFrameSolid(1);
      } else {
        const newOpacity = Math.max(0, ...([0, 1, 2, 3].map((i) => stripOpacityIn(p, i))));
        if (newOpacity > 0) drawFrameSolid(newOpacity);
      }
    }

    ctx.fillStyle = "#fff";
    ctx.fillRect(innerLeft, innerTop, imageW, imageH);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(innerLeft) + 0.5, Math.floor(innerTop) + 0.5, Math.floor(imageW), Math.floor(imageH));

    if (photoImgRef.current && photoImgRef.current.complete && photoImgRef.current.naturalWidth > 0) {
      const img = photoImgRef.current;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const r = Math.max(imageW / iw, imageH / ih);
      const sw = imageW / r;
      const sh = imageH / r;
      const sx = (iw - sw) / 2;
      const sy = (ih - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, innerLeft, innerTop, imageW, imageH);
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Загрузите фото выше", innerLeft + imageW / 2, innerTop + imageH / 2);
    }
  }, [
    texReady,
    photoReady,
    matBoardReady,
    matBoardImgs,
    strips,
    w,
    h,
    e,
    frameLayerPx,
    frameLayerImgs,
    matLayerPx,
    innerWpx,
    innerHpx,
    fit,
    dpr,
    transitionProgress
  ]);

  const cssW = Math.max(1, outerWpx * fit);
  const cssH = Math.max(1, outerHpx * fit);

  /**
   * Каскад размеров превью:
   * 1) .constructor-frame-preview-shell — width: 100%; max-width: min(1200px, 100%) из constructor.css.
   * 2) .constructor-frame-preview-viewport — фон и скругление; фиксированное соотношение сцены в CSS (не мм рамы).
   *    Пропорции рамы — только у внутреннего блока с canvas (aspectRatio outerW/outerH).
   */
  const viewportChrome = useMemo((): {
    padding: string;
    /** В embed — жёстче, чем общий max-height в constructor.css */
    maxHeight?: string;
    minHeight?: string;
  } => {
    if (embed) {
      return {
        /* Без minHeight: вместе с aspect-ratio:16/9 он раздувал intrinsic ширину сцены шире колонки — фон вылезал */
        maxHeight: "min(82dvh, min(1200px, 92vh))",
        /* Только px: clamp(...vmin...) давал нестабильный content-box и ломал 16:9 / measure */
        padding: "10px 12px"
      };
    }
    return {
      padding:
        "clamp(10px, 2.6vmin, 40px) clamp(8px, 2.2vmin, 36px) clamp(10px, 2.6vmin, 40px) clamp(8px, 2.2vmin, 36px)"
    };
  }, [embed]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        /* center давал shrink-to-fit по ширине → width:100% у shell → ~0 → сцена 16:9 схлопывалась в полоску */
        alignItems: "stretch",
        gap: 12,
        width: "100%",
        minWidth: 0
      }}
    >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 6,
            width: "100%",
            minWidth: 0
          }}
        >
        <div className="constructor-frame-preview-shell">
          <div
            ref={viewportRef}
            className="constructor-frame-preview-viewport"
            style={
              {
                position: "relative",
                zIndex: 0,
                minWidth: 0,
                ...(viewportChrome.maxHeight ? { maxHeight: viewportChrome.maxHeight } : {}),
                ...(viewportChrome.minHeight ? { minHeight: viewportChrome.minHeight } : {}),
                height: "auto",
                /* grid + place-items: центр без flex-min, иначе сцена 16:9 схлопывалась в горизонтальную щель */
                display: "grid",
                placeItems: "center",
                boxSizing: "border-box",
                padding: viewportChrome.padding
              } as CSSProperties
            }
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                right: 28,
                bottom: 18,
                width: 80,
                height: 120,
                pointerEvents: "none",
                opacity: 0.62
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 28,
                  top: 0,
                  width: 5,
                  height: 64,
                  background: "#6a8f6d",
                  borderRadius: 10,
                  transform: "rotate(-14deg)"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 44,
                  top: 4,
                  width: 5,
                  height: 66,
                  background: "#6a8f6d",
                  borderRadius: 10,
                  transform: "rotate(16deg)"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 20,
                  top: 22,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#dba4b4"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 42,
                  top: 20,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#d8b48a"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 32,
                  top: 36,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#e4c4cf"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  bottom: 8,
                  width: 42,
                  height: 58,
                  borderRadius: "20px 20px 12px 12px",
                  background: "linear-gradient(180deg, #f3ede4 0%, #d8c4aa 100%)",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)"
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 0,
                  width: 56,
                  height: 10,
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.12)",
                  filter: "blur(2px)"
                }}
              />
            </div>
            <div
              className="constructor-frame-preview-frame"
              style={{
                position: "relative",
                zIndex: 1,
                width: `min(100%, ${cssW}px)`,
                maxWidth: "100%",
                /* outerW/outerH — как в мм; flex+aspect-ratio без flexShrink:0 давали ширину → 0 на портретных форматах */
                aspectRatio: `${outerW} / ${Math.max(outerH, 1)}`,
                height: "auto",
                flexShrink: 0,
                alignSelf: "center"
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: "100%",
                  marginBottom: 6,
                  zIndex: 2,
                  pointerEvents: "none"
                }}
              >
                <PreviewDimH mm={outerW} />
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  right: "100%",
                  marginRight: 8,
                  width: PREVIEW_DIM_V_COL,
                  zIndex: 2,
                  pointerEvents: "none"
                }}
              >
                <PreviewDimV mm={outerH} />
              </div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  borderRadius: 4,
                  background: "linear-gradient(145deg, #e8edf3 0%, #d8dee8 100%)",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.14)"
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={w}
                  height={h}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    borderRadius: 4
                  }}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>
        </div>

      <p style={{ margin: 0, fontSize: 12, color: "#64748b", textAlign: "center" }}>
        Внутри рамы: {imageWidthMm}×{imageHeightMm} мм
      </p>
    </div>
  );
}
