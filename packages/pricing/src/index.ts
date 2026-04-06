import type { PriceBreakdown, PriceInput, MatboardLayerInput, FrameLayerInput } from "@yanak/types";

export {
  calculateMasterPay,
  calculateMasterPeriodSalary,
  rectanglePerimeterMeters,
  rectangleAreaM2,
  type MasterPayInput,
  type MasterPayResult
} from "./master-pay";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Внешние размеры после всех слоёв паспарту и сумма руб. по паспарту */
function matboardDimensionsAndCost(
  widthMm: number,
  heightMm: number,
  input: PriceInput
): { outerW: number; outerH: number; matboardRub: number } {
  const layers = input.matboardLayers?.filter(
    (l) => l && Number.isFinite(l.marginMm) && Number.isFinite(l.pricePerM2)
  ) as MatboardLayerInput[] | undefined;

  if (layers && layers.length > 0) {
    let w = widthMm;
    let h = heightMm;
    let matboardRub = 0;
    for (const layer of layers) {
      const m = Math.max(0, layer.marginMm);
      w += 2 * m;
      h += 2 * m;
      const areaM2 = (w * h) / 1_000_000;
      matboardRub += Math.max(0, layer.pricePerM2) * areaM2;
    }
    return { outerW: w, outerH: h, matboardRub };
  }

  const margin = input.matboardMarginMm ?? 0;
  const outerW = widthMm + 2 * margin;
  const outerH = heightMm + 2 * margin;
  const areaM2 = (outerW * outerH) / 1_000_000;
  const matboardRub = (input.matboardPricePerM2 ?? 0) * areaM2;
  return { outerW, outerH, matboardRub };
}

export function calculatePrice(input: PriceInput): PriceBreakdown {
  const { outerW, outerH, matboardRub } = matboardDimensionsAndCost(input.widthMm, input.heightMm, input);
  const areaM2 = (outerW * outerH) / 1_000_000;

  const parsedFrameLayers = input.frameLayers?.filter(
    (l) => l && Number.isFinite(l.profileWidthMm) && Number.isFinite(l.pricePerMeter)
  ) as FrameLayerInput[] | undefined;

  let frame = 0;
  if (parsedFrameLayers && parsedFrameLayers.length > 0) {
    let w = outerW;
    let h = outerH;
    for (const layer of parsedFrameLayers) {
      const W = Math.max(0, layer.profileWidthMm);
      const waste = Number.isFinite(layer.wasteCoeff) ? Math.max(1, layer.wasteCoeff ?? 1) : input.frameWasteCoeff;
      const frameMeters = W > 0 ? (2 * (w + h) + 8 * W) / 1000 : ((2 * (w + h)) / 1000) * waste;
      frame += frameMeters * Math.max(0, layer.pricePerMeter);
      w += 2 * W;
      h += 2 * W;
    }
  } else {
    // L_mm = 2×(A+B) + 8×W, где A,B — внешние размеры (с учётом паспарту),
    // W — ширина багетного профиля.
    const W = input.frameProfileWidthMm;
    const frameMeters =
      W != null && Number.isFinite(W)
        ? (2 * (outerW + outerH) + 8 * W) / 1000
        : ((2 * (outerW + outerH)) / 1000) * input.frameWasteCoeff;
    frame = frameMeters * input.framePricePerMeter;
  }
  const matboard = matboardRub;
  const glass = (input.glassPricePerM2 ?? 0) * areaM2;
  const backing = (input.backingPricePerM2 ?? 0) * areaM2;
  const assembly = input.assemblyPrice ?? 0;
  const rush = input.rushFee ?? 0;
  const discount = Math.max(0, input.discountAmount ?? 0);

  const rawTotal = frame + matboard + glass + backing + assembly + rush - discount;
  const totalBeforeMin = Math.max(0, rawTotal);
  const total = Math.max(totalBeforeMin, input.minimalOrderPrice ?? 0);

  return {
    frame: roundMoney(frame),
    matboard: roundMoney(matboard),
    glass: roundMoney(glass),
    backing: roundMoney(backing),
    assembly: roundMoney(assembly),
    rush: roundMoney(rush),
    discount: roundMoney(discount),
    total: roundMoney(total)
  };
}
