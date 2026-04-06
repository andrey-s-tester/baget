import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CalculatePriceDto } from "./dto/calculate-price.dto";

const DEFAULT_RULES = {
  frameWasteCoeff: 1.1,
  assemblyPrice: 750,
  minimalOrderPrice: 1500,
  matboardPricePerM2: 14552
};

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

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async updateRules(data: {
    frameWasteCoeff?: number;
    assemblyPrice?: number;
    minimalOrderPrice?: number;
    matboardPricePerM2?: number;
  }) {
    let config = await this.prisma.pricingConfig.findFirst();
    if (!config) {
      config = await this.prisma.pricingConfig.create({
        data: {
          frameWasteCoeff: data.frameWasteCoeff ?? DEFAULT_RULES.frameWasteCoeff,
          assemblyPrice: data.assemblyPrice ?? DEFAULT_RULES.assemblyPrice,
          minimalOrderPrice: data.minimalOrderPrice ?? DEFAULT_RULES.minimalOrderPrice,
          matboardPricePerM2: data.matboardPricePerM2 ?? DEFAULT_RULES.matboardPricePerM2
        }
      });
    } else {
      config = await this.prisma.pricingConfig.update({
        where: { id: config.id },
        data: {
          ...(data.frameWasteCoeff != null && { frameWasteCoeff: data.frameWasteCoeff }),
          ...(data.assemblyPrice != null && { assemblyPrice: data.assemblyPrice }),
          ...(data.minimalOrderPrice != null && { minimalOrderPrice: data.minimalOrderPrice }),
          ...(data.matboardPricePerM2 != null && { matboardPricePerM2: data.matboardPricePerM2 })
        }
      });
    }
    return this.getRules();
  }

  async getRules() {
    const [config, glass, backing] = await Promise.all([
      this.prisma.pricingConfig.findFirst(),
      this.prisma.glassType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      this.prisma.backingType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
    ]);

    return {
      frameWasteCoeff: config ? Number(config.frameWasteCoeff) : DEFAULT_RULES.frameWasteCoeff,
      assemblyPrice: config ? Number(config.assemblyPrice) : DEFAULT_RULES.assemblyPrice,
      minimalOrderPrice: config ? Number(config.minimalOrderPrice) : DEFAULT_RULES.minimalOrderPrice,
      matboardPricePerM2: config ? Number(config.matboardPricePerM2) : DEFAULT_RULES.matboardPricePerM2,
      glassPrices: glass.map((g: { id: string; code?: string | null; name: string; pricePerM2: unknown }) => ({
        id: g.code ?? g.id,
        name: g.name,
        price: Number(g.pricePerM2)
      })),
      backingPrices: backing
        .filter((b: { pricePerM2: unknown }) => b.pricePerM2 != null)
        .map((b: { id: string; code?: string | null; name: string; pricePerM2: unknown }) => ({
          id: b.code ?? b.id,
          name: b.name,
          price: Number(b.pricePerM2)
        }))
    };
  }

  calculate(input: CalculatePriceDto) {
    const base: PriceInputLocal = {
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      framePricePerMeter: input.framePricePerMeter,
      frameWasteCoeff: input.frameWasteCoeff,
      frameProfileWidthMm: input.frameProfileWidthMm,
      glassPricePerM2: input.glassPricePerM2,
      backingPricePerM2: input.backingPricePerM2,
      assemblyPrice: input.assemblyPrice,
      rushFee: input.rushFee,
      discountAmount: input.discountAmount,
      minimalOrderPrice: input.minimalOrderPrice
    };
    if (input.frameLayers && input.frameLayers.length > 0) {
      base.frameLayers = input.frameLayers.map((l) => ({
        profileWidthMm: l.profileWidthMm,
        pricePerMeter: l.pricePerMeter,
        wasteCoeff: l.wasteCoeff
      }));
    }
    if (input.matboardLayers && input.matboardLayers.length > 0) {
      base.matboardLayers = input.matboardLayers.map((l) => ({
        marginMm: l.marginMm,
        pricePerM2: l.pricePerM2
      }));
    } else {
      base.matboardMarginMm = input.matboardMarginMm;
      base.matboardPricePerM2 = input.matboardPricePerM2;
    }
    return calculatePriceLocal(base);
  }
}
