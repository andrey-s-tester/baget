import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type PriceInputLocal = {
  widthMm: number;
  heightMm: number;
  framePricePerMeter: number;
  frameWasteCoeff: number;
  frameProfileWidthMm?: number;
  frameLayers?: { profileWidthMm: number; pricePerMeter: number; wasteCoeff?: number }[];
  matboardMarginMm?: number;
  matboardPricePerM2?: number;
  matboardLayers?: { marginMm: number; pricePerM2: number }[];
  glassPricePerM2?: number;
  backingPricePerM2?: number;
  assemblyPrice?: number;
  rushFee?: number;
  discountAmount?: number;
  minimalOrderPrice?: number;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ message: msg }, { status });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculatePriceLocal(input: PriceInputLocal) {
  const matLayers =
    input.matboardLayers?.filter((l) => Number.isFinite(l.marginMm) && Number.isFinite(l.pricePerM2)) ?? [];

  let outerW = input.widthMm;
  let outerH = input.heightMm;
  let matboardRub = 0;

  if (matLayers.length > 0) {
    for (const layer of matLayers) {
      const m = Math.max(0, layer.marginMm);
      outerW += 2 * m;
      outerH += 2 * m;
      const areaM2 = (outerW * outerH) / 1_000_000;
      matboardRub += Math.max(0, layer.pricePerM2) * areaM2;
    }
  } else {
    const margin = Math.max(0, input.matboardMarginMm ?? 0);
    outerW += 2 * margin;
    outerH += 2 * margin;
    const areaM2 = (outerW * outerH) / 1_000_000;
    matboardRub = Math.max(0, input.matboardPricePerM2 ?? 0) * areaM2;
  }

  const frameLayers =
    input.frameLayers?.filter((l) => Number.isFinite(l.profileWidthMm) && Number.isFinite(l.pricePerMeter)) ?? [];

  let frame = 0;
  if (frameLayers.length > 0) {
    let w = outerW;
    let h = outerH;
    for (const layer of frameLayers) {
      const profile = Math.max(0, layer.profileWidthMm);
      const waste = Number.isFinite(layer.wasteCoeff)
        ? Math.max(1, layer.wasteCoeff ?? 1)
        : Math.max(1, input.frameWasteCoeff);
      const meters = profile > 0 ? (2 * (w + h) + 8 * profile) / 1000 : ((2 * (w + h)) / 1000) * waste;
      frame += meters * Math.max(0, layer.pricePerMeter);
      w += 2 * profile;
      h += 2 * profile;
    }
  } else {
    const profile = input.frameProfileWidthMm;
    const meters =
      profile != null && Number.isFinite(profile)
        ? (2 * (outerW + outerH) + 8 * Math.max(0, profile)) / 1000
        : ((2 * (outerW + outerH)) / 1000) * Math.max(1, input.frameWasteCoeff);
    frame = meters * Math.max(0, input.framePricePerMeter);
  }

  const areaM2 = (outerW * outerH) / 1_000_000;
  const glass = Math.max(0, input.glassPricePerM2 ?? 0) * areaM2;
  const backing = Math.max(0, input.backingPricePerM2 ?? 0) * areaM2;
  const assembly = Math.max(0, input.assemblyPrice ?? 0);
  const rush = Math.max(0, input.rushFee ?? 0);
  const discount = Math.max(0, input.discountAmount ?? 0);
  const rawTotal = frame + matboardRub + glass + backing + assembly + rush - discount;
  const total = Math.max(Math.max(0, rawTotal), Math.max(0, input.minimalOrderPrice ?? 0));

  return {
    frame: roundMoney(frame),
    matboard: roundMoney(matboardRub),
    glass: roundMoney(glass),
    backing: roundMoney(backing),
    assembly: roundMoney(assembly),
    rush: roundMoney(rush),
    discount: roundMoney(discount),
    total: roundMoney(total)
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (!body || typeof body !== "object") {
    return bad("Invalid body");
  }
  const b = body as Record<string, unknown>;

  const widthMm = Number(b.widthMm);
  const heightMm = Number(b.heightMm);
  const framePricePerMeter = Number(b.framePricePerMeter);
  const frameWasteCoeff = Number(b.frameWasteCoeff);
  const frameProfileWidthMm =
    b.frameProfileWidthMm != null ? Number(b.frameProfileWidthMm) : undefined;
  let frameLayers: { profileWidthMm: number; pricePerMeter: number; wasteCoeff?: number }[] | undefined;

  if (!Number.isFinite(widthMm) || widthMm < 1 || widthMm > 5000) {
    return bad("widthMm invalid");
  }
  if (!Number.isFinite(heightMm) || heightMm < 1 || heightMm > 5000) {
    return bad("heightMm invalid");
  }
  if (!Number.isFinite(framePricePerMeter) || framePricePerMeter < 0) {
    return bad("framePricePerMeter invalid");
  }
  if (!Number.isFinite(frameWasteCoeff) || frameWasteCoeff < 1 || frameWasteCoeff > 2) {
    return bad("frameWasteCoeff invalid");
  }
  if (frameProfileWidthMm != null && (!Number.isFinite(frameProfileWidthMm) || frameProfileWidthMm < 0)) {
    return bad("frameProfileWidthMm invalid");
  }
  if (Array.isArray(b.frameLayers)) {
    const parsed = (b.frameLayers as unknown[])
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const profileWidthMm = Number(o.profileWidthMm);
        const pricePerMeter = Number(o.pricePerMeter);
        const wasteCoeff = o.wasteCoeff != null ? Number(o.wasteCoeff) : undefined;
        if (!Number.isFinite(profileWidthMm) || profileWidthMm < 0 || !Number.isFinite(pricePerMeter) || pricePerMeter < 0) {
          return null;
        }
        if (wasteCoeff != null && (!Number.isFinite(wasteCoeff) || wasteCoeff < 1 || wasteCoeff > 2)) {
          return null;
        }
        return wasteCoeff != null ? { profileWidthMm, pricePerMeter, wasteCoeff } : { profileWidthMm, pricePerMeter };
      })
      .filter((x): x is { profileWidthMm: number; pricePerMeter: number; wasteCoeff?: number } => x != null);
    if (parsed.length > 0) frameLayers = parsed;
  }

  const matboardMarginMm = b.matboardMarginMm != null ? Number(b.matboardMarginMm) : 0;

  let matboardLayers: { marginMm: number; pricePerM2: number }[] | undefined;
  if (Array.isArray(b.matboardLayers)) {
    const parsed = (b.matboardLayers as unknown[])
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const marginMm = Number(o.marginMm);
        const pricePerM2 = Number(o.pricePerM2);
        if (!Number.isFinite(marginMm) || marginMm < 0 || !Number.isFinite(pricePerM2) || pricePerM2 < 0) {
          return null;
        }
        return { marginMm, pricePerM2 };
      })
      .filter((x): x is { marginMm: number; pricePerM2: number } => x != null);
    if (parsed.length > 0) matboardLayers = parsed;
  }

  const payload: PriceInputLocal = {
    widthMm,
    heightMm,
    framePricePerMeter,
    frameWasteCoeff,
    frameProfileWidthMm: frameProfileWidthMm,
    glassPricePerM2: b.glassPricePerM2 != null ? Number(b.glassPricePerM2) : undefined,
    backingPricePerM2: b.backingPricePerM2 != null ? Number(b.backingPricePerM2) : undefined,
    assemblyPrice: b.assemblyPrice != null ? Number(b.assemblyPrice) : undefined,
    rushFee: b.rushFee != null ? Number(b.rushFee) : undefined,
    discountAmount: b.discountAmount != null ? Number(b.discountAmount) : undefined,
    minimalOrderPrice: b.minimalOrderPrice != null ? Number(b.minimalOrderPrice) : undefined
  };
  if (frameLayers && frameLayers.length > 0) payload.frameLayers = frameLayers;
  if (matboardLayers && matboardLayers.length > 0) {
    payload.matboardLayers = matboardLayers;
  } else {
    payload.matboardMarginMm =
      Number.isFinite(matboardMarginMm) && matboardMarginMm >= 0 ? matboardMarginMm : undefined;
    payload.matboardPricePerM2 = b.matboardPricePerM2 != null ? Number(b.matboardPricePerM2) : undefined;
  }

  return NextResponse.json(calculatePriceLocal(payload));
}
