import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccessoryPriceUnit, OrderStatus, Prisma, StockItemKind, StockMovementReason } from "@prisma/client";
import { normalizePhone } from "../../utils/phone";
import { PrismaService } from "../prisma/prisma.service";

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Периметр проёма (м) с учётом паспарту — как в @yanak/types/openingPerimeterMeters */
function openingPerimeterMForOrderConfig(config: Record<string, unknown>, widthMm: number, heightMm: number): number {
  const rawLayers = config.matboardLayers;
  const withMat = config.withMatboard === true || config.useMatboard === true;
  let outerW = Math.max(0, widthMm);
  let outerH = Math.max(0, heightMm);
  if (Array.isArray(rawLayers) && rawLayers.length > 0) {
    for (const item of rawLayers) {
      const row = item as Record<string, unknown>;
      const m = Math.max(0, num(row.marginMm, 0));
      outerW += 2 * m;
      outerH += 2 * m;
    }
  } else if (withMat) {
    const margin = Math.max(0, num(config.matboardWidthMm, 20));
    outerW = widthMm + 2 * margin;
    outerH = heightMm + 2 * margin;
  }
  return (2 * (outerW + outerH)) / 1000;
}

/** Потребность в материалах под заказ (оформление): багет (м), паспарту (м²), стекло/задник по проёму (м²), фурнитура (шт. или п.м. по priceUnit).
 * Для багета:
 * - если задан `frameProfileWidthMm` (W): L_mm = 2×(A+B) + 8×W
 * - иначе: периметр × коэф. отхода
 */
function multiplyDecimal(d: Prisma.Decimal, factor: number): Prisma.Decimal {
  if (!Number.isFinite(factor) || factor <= 0) return d;
  return new Prisma.Decimal((Number(d) * factor).toFixed(4));
}

function computeOrderMaterialNeeds(
  config: Record<string, unknown>,
  frameWasteCoeffDefault: number,
  accessoryPriceUnitByCode: Map<string, AccessoryPriceUnit>
): {
  frames?: { sku: string; meters: Prisma.Decimal }[];
  matboards?: { sku: string; m2: Prisma.Decimal }[];
  glass?: { id: string; m2: Prisma.Decimal };
  backing?: { id: string; m2: Prisma.Decimal };
  accessories?: { code: string; qty: Prisma.Decimal }[];
} {
  const widthMm = num(config.widthMm, 0);
  const heightMm = num(config.heightMm, 0);
  const lineQty = Math.max(1, Math.min(500, Math.floor(num(config.quantity, 1))));
  if (widthMm <= 0 || heightMm <= 0) {
    return {};
  }

  const rawLayers = config.matboardLayers;
  const withMat = config.withMatboard === true || config.useMatboard === true;
  let outerW = widthMm;
  let outerH = heightMm;

  const matBySku = new Map<string, number>();

  if (Array.isArray(rawLayers) && rawLayers.length > 0) {
    for (const item of rawLayers) {
      const row = item as Record<string, unknown>;
      const sku = str(row.sku);
      if (!sku) continue;
      const margin = Math.max(0, num(row.marginMm, 20));
      outerW += 2 * margin;
      outerH += 2 * margin;
      const layerM2 = (outerW * outerH) / 1_000_000;
      matBySku.set(sku, (matBySku.get(sku) ?? 0) + layerM2);
    }
  } else if (withMat) {
    const margin = num(config.matboardWidthMm, 20);
    outerW = widthMm + 2 * margin;
    outerH = heightMm + 2 * margin;
    const matSku = str(config.selectedMatboardSku);
    if (matSku) {
      const m2 = (outerW * outerH) / 1_000_000;
      matBySku.set(matSku, (matBySku.get(matSku) ?? 0) + m2);
    }
  }

  const perimeterM = openingPerimeterMForOrderConfig(config, widthMm, heightMm);
  const W = num(config.frameProfileWidthMm, 0);
  const frameMetersRaw =
    W > 0 ? (2 * (outerW + outerH) + 8 * W) / 1000 : perimeterM * num(config.frameWasteCoeff, frameWasteCoeffDefault);

  const out: {
    frames?: { sku: string; meters: Prisma.Decimal }[];
    matboards?: { sku: string; m2: Prisma.Decimal }[];
    glass?: { id: string; m2: Prisma.Decimal };
    backing?: { id: string; m2: Prisma.Decimal };
    accessories?: { code: string; qty: Prisma.Decimal }[];
  } = {};

  const rawFrameLayers = config.frameLayers;
  if (Array.isArray(rawFrameLayers) && rawFrameLayers.length > 0) {
    let w = outerW;
    let h = outerH;
    const frames: { sku: string; meters: Prisma.Decimal }[] = [];
    for (const item of rawFrameLayers) {
      const row = item as Record<string, unknown>;
      const sku = str(row.sku);
      if (!sku) continue;
      const W = Math.max(0, num(row.profileWidthMm, 0));
      const waste = Math.max(1, num(row.wasteCoeff, num(config.frameWasteCoeff, frameWasteCoeffDefault)));
      const metersRaw = W > 0 ? (2 * (w + h) + 8 * W) / 1000 : ((2 * (w + h)) / 1000) * waste;
      frames.push({ sku, meters: new Prisma.Decimal(metersRaw.toFixed(3)) });
      w += 2 * W;
      h += 2 * W;
    }
    if (frames.length > 0) out.frames = frames;
  } else {
    const frameMeters = new Prisma.Decimal(frameMetersRaw.toFixed(3));
    const frameSku = str(config.selectedSku);
    if (frameSku) {
      out.frames = [{ sku: frameSku, meters: frameMeters }];
    }
  }

  if (matBySku.size > 0) {
    out.matboards = [...matBySku.entries()].map(([sku, m2]) => ({
      sku,
      m2: new Prisma.Decimal(m2.toFixed(4))
    }));
  }

  const openingM2 = (outerW * outerH) / 1_000_000;
  const openingM2Str = openingM2.toFixed(4);

  const glassId = str(config.glassType) ?? str(config.glassId);
  if (glassId && glassId !== "none") {
    out.glass = { id: glassId, m2: new Prisma.Decimal(openingM2Str) };
  }

  const backingId = str(config.backingType) ?? str(config.backingId);
  if (
    backingId &&
    backingId !== "none" &&
    backingId !== "stretch" &&
    backingId !== "stretcher"
  ) {
    out.backing = { id: backingId, m2: new Prisma.Decimal(openingM2Str) };
  }

  const accessoryCodes: string[] = [];
  const pushCode = (c: string | undefined) => {
    if (c) accessoryCodes.push(c);
  };
  pushCode(str(config.hangerId));
  pushCode(str(config.subframeId));
  pushCode(str(config.assemblyProductId));
  pushCode(str(config.fitTypeId));
  pushCode(str(config.standLegId));
  pushCode(str(config.finishingId));

  const accessories: { code: string; qty: Prisma.Decimal }[] = [];
  for (const code of accessoryCodes) {
    const u = accessoryPriceUnitByCode.get(code) ?? AccessoryPriceUnit.piece;
    const base =
      u === AccessoryPriceUnit.linear_meter ? perimeterM : 1;
    accessories.push({
      code,
      qty: new Prisma.Decimal((base * lineQty).toFixed(4))
    });
  }
  if (accessories.length > 0) {
    out.accessories = accessories;
  }

  if (lineQty > 1) {
    if (out.frames?.length) {
      out.frames = out.frames.map((f) => ({ ...f, meters: multiplyDecimal(f.meters, lineQty) }));
    }
    if (out.matboards?.length) {
      out.matboards = out.matboards.map((m) => ({ ...m, m2: multiplyDecimal(m.m2, lineQty) }));
    }
    if (out.glass) {
      out.glass = { ...out.glass, m2: multiplyDecimal(out.glass.m2, lineQty) };
    }
    if (out.backing) {
      out.backing = { ...out.backing, m2: multiplyDecimal(out.backing.m2, lineQty) };
    }
  }

  return out;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Следующий сквозной номер заказа: «1», «2», «3»… */
  private async allocOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    // Синглтон id=1 мог отсутствовать (Docker/старая БД) — тогда UPDATE не трогал строки и создание падало с 500.
    // Не использовать в строке символ `$` (например regex '$'): в Prisma tagged raw он может трактоваться как параметр и ломать SQL.
    await tx.$executeRaw`
      INSERT INTO "OrderNumberSequence" ("id", "lastNumber")
      SELECT 1, COALESCE(
        (SELECT MAX(CAST("orderNumber" AS INTEGER)) FROM "Order" WHERE "orderNumber" SIMILAR TO '[0-9]+'),
        0
      )
      ON CONFLICT ("id") DO NOTHING
    `;
    await tx.$executeRaw`
      UPDATE "OrderNumberSequence"
      SET "lastNumber" = GREATEST(
        "lastNumber",
        COALESCE(
          (SELECT MAX(CAST("orderNumber" AS INTEGER)) FROM "Order" WHERE "orderNumber" SIMILAR TO '[0-9]+'),
          0
        )
      )
      WHERE "id" = 1
    `;
    const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
      UPDATE "OrderNumberSequence"
      SET "lastNumber" = "lastNumber" + 1
      WHERE "id" = 1
      RETURNING "lastNumber"
    `;
    const n = rows[0]?.lastNumber;
    if (n == null || !Number.isFinite(n) || n < 1) {
      throw new BadRequestException(
        "Не удалось выделить номер заказа. Выполните миграции БД (таблица OrderNumberSequence)."
      );
    }
    return String(n);
  }

  /**
   * @param opts.lite — без breakdownJson (меньше JSON и трафика) для дашборда/отчётов.
   * @param opts.limit — ограничение числа строк; для lite без limit по умолчанию 800.
   * @param opts.ids — только эти заказы, всегда с breakdownJson (для деталей на «Покупателях»).
   * @param opts.from / opts.to — фильтр по createdAt (для отчёта мастера за день).
   */
  async list(opts?: { limit?: number; lite?: boolean; ids?: string[]; from?: Date; to?: Date }) {
    const idList = opts?.ids?.map((id) => id.trim()).filter(Boolean) ?? [];
    if (idList.length > 0) {
      const unique = [...new Set(idList)].slice(0, 300);
      const rows = await this.prisma.order.findMany({
        where: { id: { in: unique } },
        include: { store: { select: { name: true } } }
      });
      return rows.map((o) => {
        const cfg = (o.breakdownJson ?? {}) as Record<string, unknown>;
        const oc = cfg.orderComment;
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          total: Number(o.totalSnapshot),
          createdAt: o.createdAt.toISOString(),
          customerName: o.customerName,
          phone: o.customerPhone ?? "",
          email: o.customerEmail ?? undefined,
          store: o.store?.name ?? "",
          comment: typeof oc === "string" && oc.trim() ? oc.trim() : undefined,
          config: cfg
        };
      });
    }

    const lite = opts?.lite === true;
    const lim = opts?.limit;
    const hasRange = opts?.from != null || opts?.to != null;
    const dateWhere: Prisma.DateTimeFilter = {};
    if (opts?.from) dateWhere.gte = opts.from;
    if (opts?.to) dateWhere.lte = opts.to;
    const whereCreated =
      Object.keys(dateWhere).length > 0 ? { createdAt: dateWhere as Prisma.DateTimeFilter } : {};

    const capped =
      lim != null && Number.isFinite(lim)
        ? Math.min(Math.max(Math.floor(Number(lim)), 1), 5000)
        : hasRange
          ? 2000
          : undefined;

    const orderBy = hasRange ? ({ createdAt: "asc" } as const) : ({ createdAt: "desc" } as const);

    if (lite) {
      const take = capped ?? 800;
      const rows = await this.prisma.order.findMany({
        where: whereCreated,
        orderBy,
        take,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalSnapshot: true,
          createdAt: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          store: { select: { name: true } }
        }
      });
      return rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: Number(o.totalSnapshot),
        createdAt: o.createdAt.toISOString(),
        customerName: o.customerName,
        phone: o.customerPhone ?? "",
        email: o.customerEmail ?? undefined,
        store: o.store?.name ?? "",
        config: {} as Record<string, unknown>
      }));
    }

    const rows = await this.prisma.order.findMany({
      where: whereCreated,
      orderBy,
      ...(capped != null ? { take: capped } : {}),
      include: {
        store: { select: { name: true } }
      }
    });
    return rows.map((o) => {
      const cfg = (o.breakdownJson ?? {}) as Record<string, unknown>;
      const oc = cfg.orderComment;
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: Number(o.totalSnapshot),
        createdAt: o.createdAt.toISOString(),
        customerName: o.customerName,
        phone: o.customerPhone ?? "",
        email: o.customerEmail ?? undefined,
        store: o.store?.name ?? "",
        comment: typeof oc === "string" && oc.trim() ? oc.trim() : undefined,
        config: cfg
      };
    });
  }

  async create(data: {
    customerName: string;
    phone?: string;
    email?: string;
    storeId?: string;
    store?: string;
    comment?: string;
    total: number;
    config: Record<string, unknown>;
  }) {
    let storeId: string | null = data.storeId?.trim() || null;
    if (!storeId && data.store?.trim()) {
      const found = await this.prisma.store.findFirst({
        where: { name: { equals: data.store!.trim(), mode: "insensitive" } }
      });
      storeId = found?.id ?? null;
    }
    let retailCustomerId: string | null = null;
    const phoneTrim = data.phone?.trim() || "";
    const emailTrim = data.email?.trim() || null;
    if (phoneTrim) {
      const norm = normalizePhone(phoneTrim);
      if (norm.length >= 7) {
        const customer = await this.prisma.customer.upsert({
          where: { phoneNormalized: norm },
          create: {
            name: data.customerName.trim(),
            phone: phoneTrim,
            phoneNormalized: norm,
            email: emailTrim
          },
          update: {
            name: data.customerName.trim(),
            ...(emailTrim && { email: emailTrim })
          }
        });
        retailCustomerId = customer.id;
      }
    }

    const pricing = await this.prisma.pricingConfig.findFirst();
    const wasteDefault = pricing?.frameWasteCoeff ? Number(pricing.frameWasteCoeff) : 1.1;

    const cfg = data.config ?? {};
    const accCodes = [
      str(cfg.hangerId),
      str(cfg.subframeId),
      str(cfg.assemblyProductId),
      str(cfg.fitTypeId),
      str(cfg.standLegId),
      str(cfg.finishingId)
    ].filter((c): c is string => Boolean(c));
    const accRows =
      accCodes.length > 0
        ? await this.prisma.accessoryItem.findMany({
            where: { code: { in: [...new Set(accCodes)] } },
            select: { code: true, priceUnit: true }
          })
        : [];
    const accessoryPriceUnitByCode = new Map(accRows.map((r) => [r.code, r.priceUnit]));

    const needs = computeOrderMaterialNeeds(cfg, wasteDefault, accessoryPriceUnitByCode);

    const breakdown: Record<string, unknown> = { ...cfg };
    if (data.comment?.trim()) breakdown.orderComment = data.comment.trim();

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.allocOrderNumber(tx);
      const o = await tx.order.create({
        data: {
          orderNumber,
          customerName: data.customerName.trim(),
          customerPhone: phoneTrim || null,
          customerEmail: emailTrim,
          retailCustomerId,
          storeId,
          status: OrderStatus.new,
          totalSnapshot: data.total,
          breakdownJson: breakdown as object
        }
      });

      if (needs.frames?.length) {
        for (const { sku, meters } of needs.frames) {
          const dec = await tx.frameProfile.updateMany({
            where: { sku, stockMeters: { gte: meters } },
            data: { stockMeters: { decrement: meters } }
          });
          if (dec.count === 0) {
            const row = await tx.frameProfile.findUnique({ where: { sku } });
            if (!row) {
              throw new BadRequestException(`Данного нет на складе: багет «${sku}»`);
            }
            const have = Number(row.stockMeters);
            throw new BadRequestException(
              `Данного нет на складе: багет «${sku}» (нужно ${meters.toString()} м, доступно ${have.toFixed(3)} м)`
            );
          }
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.frame,
              sku,
              delta: meters.negated(),
              unit: "m",
              reason: StockMovementReason.order,
              note: `Списание по заказу ${o.orderNumber}`
            }
          });
        }
      }

      if (needs.matboards?.length) {
        for (const { sku, m2 } of needs.matboards) {
          const dec = await tx.matboardProfile.updateMany({
            where: { sku, stockM2: { gte: m2 } },
            data: { stockM2: { decrement: m2 } }
          });
          if (dec.count === 0) {
            const row = await tx.matboardProfile.findUnique({ where: { sku } });
            if (!row) {
              throw new BadRequestException(`Данного нет на складе: паспарту «${sku}»`);
            }
            const have = Number(row.stockM2);
            throw new BadRequestException(
              `Данного нет на складе: паспарту «${sku}» (нужно ${m2.toString()} м², доступно ${have.toFixed(4)} м²)`
            );
          }
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.matboard,
              sku,
              delta: m2.negated(),
              unit: "m2",
              reason: StockMovementReason.order,
              note: `Списание по заказу ${o.orderNumber}`
            }
          });
        }
      }

      if (needs.glass) {
        const { id, m2 } = needs.glass;
        const gRow = await tx.glassType.findFirst({
          where: { OR: [{ code: id }, { id }] }
        });
        if (!gRow) {
          throw new BadRequestException(`Данного нет на складе: стекло «${id}»`);
        }
        if (!gRow.excludeFromStock) {
          const dec = await tx.glassType.updateMany({
            where: {
              OR: [{ code: id }, { id }],
              stockM2: { gte: m2 }
            },
            data: { stockM2: { decrement: m2 } }
          });
          if (dec.count === 0) {
            const have = Number(gRow.stockM2);
            throw new BadRequestException(
              `Данного нет на складе: стекло «${gRow.name}» (нужно ${m2.toString()} м², доступно ${have.toFixed(4)} м²)`
            );
          }
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.glass,
              sku: gRow.code ?? gRow.id,
              delta: m2.negated(),
              unit: "m2",
              reason: StockMovementReason.order,
              note: `Списание по заказу ${o.orderNumber}`
            }
          });
        }
      }

      if (needs.backing) {
        const { id, m2 } = needs.backing;
        const bRow = await tx.backingType.findFirst({
          where: { OR: [{ code: id }, { id }] }
        });
        if (!bRow) {
          throw new BadRequestException(`Данного нет на складе: задник «${id}»`);
        }
        if (!bRow.excludeFromStock) {
          const dec = await tx.backingType.updateMany({
            where: {
              OR: [{ code: id }, { id }],
              stockM2: { gte: m2 }
            },
            data: { stockM2: { decrement: m2 } }
          });
          if (dec.count === 0) {
            const have = Number(bRow.stockM2);
            throw new BadRequestException(
              `Данного нет на складе: задник «${bRow.name}» (нужно ${m2.toString()} м², доступно ${have.toFixed(4)} м²)`
            );
          }
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.backing,
              sku: bRow.code ?? bRow.id,
              delta: m2.negated(),
              unit: "m2",
              reason: StockMovementReason.order,
              note: `Списание по заказу ${o.orderNumber}`
            }
          });
        }
      }

      if (needs.accessories?.length) {
        for (const { code, qty } of needs.accessories) {
          const accRow = await tx.accessoryItem.findUnique({ where: { code } });
          if (!accRow) {
            throw new BadRequestException(`Данного нет на складе: фурнитура «${code}»`);
          }
          if (accRow.excludeFromStock) {
            continue;
          }
          const dec = await tx.accessoryItem.updateMany({
            where: { code, stockQty: { gte: qty } },
            data: { stockQty: { decrement: qty } }
          });
          if (dec.count === 0) {
            const have = Number(accRow.stockQty);
            const u = accRow.priceUnit;
            const unitRu = u === AccessoryPriceUnit.linear_meter ? "п.м." : "шт.";
            throw new BadRequestException(
              `Данного нет на складе: ${accRow.name} (нужно ${qty.toString()} ${unitRu}, доступно ${have.toFixed(3)} ${unitRu})`
            );
          }
          const moveUnit = accRow.priceUnit === AccessoryPriceUnit.linear_meter ? "m" : "pcs";
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.accessory,
              sku: accRow.code,
              delta: qty.negated(),
              unit: moveUnit,
              reason: StockMovementReason.order,
              note: `Списание по заказу ${o.orderNumber}`
            }
          });
        }
      }

      if (cfg.showcaseSaleOnly === true && Array.isArray(cfg.soldShowcaseProducts)) {
        for (const rawItem of cfg.soldShowcaseProducts) {
          const row = rawItem as Record<string, unknown>;
          const pid = str(row.id);
          if (!pid) continue;
          const q = Math.max(1, Math.floor(Number(row.qty) || 1));
          const sp = await tx.showcaseProduct.findUnique({ where: { id: pid } });
          if (!sp) {
            throw new BadRequestException(`Товар витрины не найден (${pid})`);
          }
          if (sp.stockQty < q) {
            throw new BadRequestException(
              `Недостаточно остатка «${sp.title}»: нужно ${q} шт., на складе ${sp.stockQty}`
            );
          }
          await tx.showcaseProduct.update({
            where: { id: pid },
            data: {
              stockQty: sp.stockQty - q,
              inStock: sp.stockQty - q > 0
            }
          });
        }
      }

      return o;
    });

    return { ok: true, id: order.id, orderId: order.id, orderNumber: order.orderNumber };
  }

  /** Добавить позицию витрины в заказ: строка в breakdownJson.soldShowcaseProducts и увеличение totalSnapshot. */
  async addShowcaseProductToOrder(orderId: string, productId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.showcaseProduct.findFirst({
        where: { id: productId, isActive: true }
      });
      if (!product) {
        throw new NotFoundException("Товар не найден или снят с витрины");
      }
      if (product.stockQty < 1) {
        throw new BadRequestException(`Нет в наличии на складе витрины: «${product.title}»`);
      }
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException("Заказ не найден");
      }
      const breakdown = { ...((order.breakdownJson as Record<string, unknown> | null) ?? {}) };
      const raw = breakdown.soldShowcaseProducts;
      const list: Array<Record<string, unknown>> = Array.isArray(raw)
        ? raw.map((x) => ({ ...(x as Record<string, unknown>) }))
        : [];
      const price = Number(product.priceRub);
      const idx = list.findIndex((x) => String(x.id) === productId);
      if (idx >= 0) {
        const oldQty = Math.max(1, Math.floor(Number(list[idx].qty) || 1));
        list[idx] = {
          ...list[idx],
          qty: oldQty + 1
        };
      } else {
        list.push({
          id: product.id,
          title: product.title,
          artist: product.artist,
          sizeLabel: product.sizeLabel,
          priceRub: price,
          qty: 1,
          imageUrl: product.imageUrl
        });
      }
      const prevTotal = new Prisma.Decimal(order.totalSnapshot.toString());
      const newTotal = prevTotal.add(new Prisma.Decimal(price));
      breakdown.soldShowcaseProducts = list;
      await tx.showcaseProduct.update({
        where: { id: productId },
        data: {
          stockQty: product.stockQty - 1,
          inStock: product.stockQty - 1 > 0
        }
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          totalSnapshot: newTotal,
          breakdownJson: breakdown as Prisma.InputJsonValue
        }
      });
      return { ok: true as const, total: Number(newTotal) };
    });
  }

  async updateStatus(id: string, status: OrderStatus, actorId?: string | null) {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { status }
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status,
          actorId: actorId ?? null
        }
      });
    });
    return { ok: true };
  }

  async delete(id: string) {
    await this.prisma.order.delete({ where: { id } });
    return { ok: true };
  }
}
