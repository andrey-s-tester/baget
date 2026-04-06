export type Role = "customer" | "admin" | "manager" | "worker" | "owner";

export type OrderStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "assembly"
  | "waiting_materials"
  | "ready"
  | "issued"
  | "cancelled";

/** Один слой паспарту: поле (мм) и цена каталога за м² */
export type MatboardLayerInput = {
  marginMm: number;
  pricePerM2: number;
};

/** Один слой багета: ширина профиля (мм), цена (руб/м), и опциональный коэффициент отхода */
export type FrameLayerInput = {
  profileWidthMm: number;
  pricePerMeter: number;
  wasteCoeff?: number;
};

export interface PriceInput {
  widthMm: number;
  heightMm: number;
  /** Поле паспарту, мм — для одного слоя (если нет matboardLayers) */
  matboardMarginMm?: number;
  /** Ширина багетного профиля W, мм (запас на ус под 45 градусов: +8×W) */
  frameProfileWidthMm?: number;
  framePricePerMeter: number;
  frameWasteCoeff: number;
  /** Несколько слоёв багета (внутренний -> внешний). Если задано — одиночные framePricePerMeter/frameProfileWidthMm используются как fallback только при пустом списке */
  frameLayers?: FrameLayerInput[];
  matboardPricePerM2?: number;
  /** Несколько слоёв паспарту: каждый слой увеличивает габарит; стоимость — сумма (цена×площадь) по слоям. Если задано — margin+matboardPricePerM2 одного слоя не используются */
  matboardLayers?: MatboardLayerInput[];
  glassPricePerM2?: number;
  backingPricePerM2?: number;
  assemblyPrice?: number;
  rushFee?: number;
  discountAmount?: number;
  minimalOrderPrice?: number;
}

export interface PriceBreakdown {
  frame: number;
  matboard: number;
  glass: number;
  backing: number;
  assembly: number;
  rush: number;
  discount: number;
  total: number;
}

/** Параметры проёма для расчёта периметра (м), как в списании материалов по заказу */
export type OpeningPerimeterInput = {
  widthMm: number;
  heightMm: number;
  matboardLayers?: { marginMm?: number }[];
  withMatboard?: boolean;
  useMatboard?: boolean;
  matboardWidthMm?: number;
};

function numOpening(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Периметр наружного проёма в метрах: 2×(W+H)/1000 после наращивания паспарту.
 * Согласовано с computeOrderMaterialNeeds в API.
 */
export function openingPerimeterMeters(input: OpeningPerimeterInput): number {
  const widthMm = Math.max(0, numOpening(input.widthMm, 0));
  const heightMm = Math.max(0, numOpening(input.heightMm, 0));
  let outerW = widthMm;
  let outerH = heightMm;
  const layers = input.matboardLayers;
  const withMat = input.withMatboard === true || input.useMatboard === true;
  if (Array.isArray(layers) && layers.length > 0) {
    for (const layer of layers) {
      const m = Math.max(0, numOpening(layer?.marginMm, 0));
      outerW += 2 * m;
      outerH += 2 * m;
    }
  } else if (withMat) {
    const margin = Math.max(0, numOpening(input.matboardWidthMm, 20));
    outerW = widthMm + 2 * margin;
    outerH = heightMm + 2 * margin;
  }
  return (2 * (outerW + outerH)) / 1000;
}

export type AccessoryPriceUnitClient = "piece" | "linear_meter";

export function accessoryPriceForLine(
  price: number,
  unit: AccessoryPriceUnitClient,
  perimeterM: number
): number {
  if (unit === "linear_meter") {
    return Math.round(price * perimeterM);
  }
  return price;
}
