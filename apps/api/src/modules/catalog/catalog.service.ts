import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StockItemKind, StockMovementReason, StockReceiptStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type CatalogCategory = "plastic" | "wood" | "aluminum";

const FRAME_CATALOG_SOURCES = ["bagetnaya_masterskaya", "baget_optom_ua", "svitart_net", "manual"] as const;
type FrameCatalogSource = (typeof FRAME_CATALOG_SOURCES)[number];

function isFrameCatalogSource(s: string | undefined | null): s is FrameCatalogSource {
  return !!s && (FRAME_CATALOG_SOURCES as readonly string[]).includes(s);
}

/** Верхняя граница выборки багета (каталог/инвентарь); иначе при orderBy sku новые артикулы «за пределами» первых N не попадают в конструктор. */
const MAX_FRAMES_LIST = 2500;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Публичный каталог багета — те же поля и расчёт остатков, что и в `listFramesInventory`, только активные позиции. */
  async listFrames(category?: CatalogCategory, query?: string, limit = 60) {
    const take = Math.min(Math.max(limit, 1), MAX_FRAMES_LIST);
    return this.listFramesInventory(category, query, take, true, undefined, undefined);
  }

  private toCatalogItem(r: {
    sku: string;
    name: string;
    category: string;
    catalogSource?: string;
    widthMm: number;
    widthWithoutQuarterMm: number | null;
    retailPriceMeter: { toNumber?: () => number };
    imageUrl: string | null;
    previewImageUrl: string | null;
    isActive: boolean;
    stockMeters?: Prisma.Decimal | number | null;
    minStockMeters?: Prisma.Decimal | number | null;
  }) {
    const img = (r.imageUrl && String(r.imageUrl).trim()) || "";
    const prevRaw = r.previewImageUrl && String(r.previewImageUrl).trim();
    return {
      sku: r.sku,
      name: r.name,
      category: r.category,
      catalogSource: r.catalogSource ?? "bagetnaya_masterskaya",
      widthMm: r.widthMm,
      widthWithoutQuarterMm: r.widthWithoutQuarterMm ?? r.widthMm - 6,
      retailPriceMeter: typeof r.retailPriceMeter === "object" && "toNumber" in r.retailPriceMeter ? (r.retailPriceMeter as { toNumber: () => number }).toNumber() : Number(r.retailPriceMeter),
      imageUrl: img,
      /** Пустая строка из БД не должна блокировать fallback на bi/{sku}t.jpg в клиенте. */
      previewImageUrl: prevRaw || img || undefined,
      isActive: r.isActive,
      stockMeters: this.num(r.stockMeters),
      minStockMeters: r.minStockMeters == null ? null : this.num(r.minStockMeters)
    };
  }

  async updateFrame(sku: string, data: Partial<{
    name: string;
    category: CatalogCategory;
    catalogSource: FrameCatalogSource;
    widthMm: number;
    widthWithoutQuarterMm: number;
    retailPriceMeter: number;
    imageUrl: string;
    previewImageUrl: string;
    isActive: boolean;
  }>) {
    await this.prisma.frameProfile.update({
      where: { sku },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.category != null && { category: data.category }),
        ...(data.catalogSource != null && isFrameCatalogSource(data.catalogSource) && { catalogSource: data.catalogSource }),
        ...(data.widthMm != null && { widthMm: data.widthMm }),
        ...(data.widthWithoutQuarterMm != null && { widthWithoutQuarterMm: data.widthWithoutQuarterMm }),
        ...(data.retailPriceMeter != null && { retailPriceMeter: data.retailPriceMeter }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.previewImageUrl !== undefined && { previewImageUrl: data.previewImageUrl }),
        ...(data.isActive !== undefined && { isActive: data.isActive })
      }
    });
    return { ok: true };
  }

  async createFrame(data: {
    sku: string;
    name: string;
    category: CatalogCategory;
    catalogSource?: string;
    widthMm: number;
    widthWithoutQuarterMm?: number;
    retailPriceMeter: number;
    imageUrl?: string;
    previewImageUrl?: string;
    isActive?: boolean;
    stockMeters?: number;
    minStockMeters?: number | null;
  }) {
    const sku = data.sku.trim() || `NEW-${Date.now()}`;
    const existing = await this.prisma.frameProfile.findUnique({ where: { sku } });
    const finalSku = existing ? `${sku}-${Date.now()}` : sku;
    const catalogSource: FrameCatalogSource = isFrameCatalogSource(data.catalogSource)
      ? data.catalogSource
      : "bagetnaya_masterskaya";
    const retail = data.retailPriceMeter || 5000;
    const defaultBagetImg =
      catalogSource === "bagetnaya_masterskaya"
        ? `https://bagetnaya-masterskaya.com/bi/${finalSku}.jpg`
        : null;
    const imageUrl = (data.imageUrl && data.imageUrl.trim()) || defaultBagetImg || null;
    await this.prisma.frameProfile.create({
      data: {
        sku: finalSku,
        name: data.name?.trim() || "Новый багет",
        category: data.category || "plastic",
        catalogSource,
        widthMm: data.widthMm || 50,
        widthWithoutQuarterMm: data.widthWithoutQuarterMm ?? (data.widthMm ? data.widthMm - 6 : 44),
        purchasePrice: retail * 0.55,
        retailPriceMeter: retail,
        imageUrl,
        previewImageUrl: data.previewImageUrl?.trim() || undefined,
        isActive: data.isActive ?? true,
        stockMeters: data.stockMeters != null && !Number.isNaN(data.stockMeters) ? Math.max(0, data.stockMeters) : 0,
        minStockMeters:
          data.minStockMeters === undefined || data.minStockMeters === null || Number.isNaN(data.minStockMeters)
            ? null
            : Math.max(0, data.minStockMeters)
      }
    });
    return { ok: true, sku: finalSku };
  }

  async deleteFrame(sku: string) {
    await this.prisma.frameProfile.delete({ where: { sku } });
    return { ok: true };
  }

  async deleteFramesBulk(skus: string[]) {
    const normalized = [...new Set(skus.map((s) => String(s ?? "").trim()).filter(Boolean))];
    if (normalized.length === 0) {
      return { ok: true as const, deleted: 0 };
    }
    const result = await this.prisma.frameProfile.deleteMany({
      where: { sku: { in: normalized } }
    });
    return { ok: true as const, deleted: result.count };
  }

  /** Публичный каталог паспарту — те же остатки, что в `listMatboardInventory`, только активные. */
  async listMatboard(query?: string, limit = 200) {
    const take = Math.min(Math.max(limit, 1), 500);
    return this.listMatboardInventory(query, take, true);
  }

  async updateMatboard(sku: string, data: Partial<{ name: string; pricePerM2: number; imageUrl: string; isActive: boolean; newSku: string; stockM2: number; minStockM2: number | null }>) {
    const existing = await this.prisma.matboardProfile.findUnique({ where: { sku } });
    if (!existing) return { ok: false };
    const updateData: Record<string, unknown> = {};
    if (data.name != null) updateData.name = data.name;
    if (data.pricePerM2 != null) updateData.pricePerM2 = data.pricePerM2;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.stockM2 != null && !Number.isNaN(data.stockM2)) updateData.stockM2 = Math.max(0, data.stockM2);
    if (data.minStockM2 !== undefined) {
      updateData.minStockM2 =
        data.minStockM2 == null || Number.isNaN(data.minStockM2) ? null : Math.max(0, data.minStockM2);
    }
    const newSku = (data.newSku ?? sku).toString().trim();
    if (newSku && newSku !== sku) {
      const conflict = await this.prisma.matboardProfile.findUnique({ where: { sku: newSku } });
      if (!conflict) updateData.sku = newSku;
    }
    await this.prisma.matboardProfile.update({
      where: { sku },
      data: updateData as Parameters<typeof this.prisma.matboardProfile.update>[0]["data"]
    });
    return { ok: true };
  }

  async createMatboard(data: {
    sku?: string;
    name: string;
    pricePerM2: number;
    imageUrl?: string;
    isActive?: boolean;
    stockM2?: number;
    minStockM2?: number | null;
  }) {
    const sku = (data.sku ?? `MAT-${Date.now()}`).toString().trim();
    const pricePerM2 = Math.max(0, Math.round(Number(data.pricePerM2)) || 5000);
    const isActive = data.isActive !== false;
    const existing = await this.prisma.matboardProfile.findUnique({ where: { sku } });
    const finalSku = existing ? `${sku}-${Date.now()}` : sku;
    const imageUrl = data.imageUrl ?? `https://bagetnaya-masterskaya.com/pi/${finalSku}.jpg`;
    const name = (data.name ?? "").toString().trim() || finalSku;
    const stockM2 =
      data.stockM2 != null && !Number.isNaN(data.stockM2) ? Math.max(0, data.stockM2) : 0;
    const minStockM2 =
      data.minStockM2 === undefined
        ? null
        : data.minStockM2 === null || Number.isNaN(data.minStockM2)
          ? null
          : Math.max(0, data.minStockM2);
    await this.prisma.matboardProfile.create({
      data: { sku: finalSku, name, pricePerM2, imageUrl, isActive, stockM2, minStockM2 }
    });
    return { ok: true, sku: finalSku };
  }

  async deleteMatboard(sku: string) {
    await this.prisma.matboardProfile.delete({ where: { sku } });
    return { ok: true };
  }

  /** Надёжное преобразование Prisma Decimal / строки из JSON в число для ответа API. */
  private num(d: Prisma.Decimal | number | string | null | undefined): number {
    if (d == null || d === "") return 0;
    if (typeof d === "number") return Number.isFinite(d) ? d : 0;
    if (typeof d === "string") {
      const n = parseFloat(d.trim().replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }
    const dec = d as { toNumber?: () => number; toString?: () => string };
    if (typeof dec.toNumber === "function") {
      try {
        const n = dec.toNumber();
        return Number.isFinite(n) ? n : 0;
      } catch {
        /* fall through */
      }
    }
    if (typeof dec.toString === "function") {
      const n = parseFloat(dec.toString().replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(d as unknown);
    return Number.isFinite(n) ? n : 0;
  }

  async listFramesInventory(
    category?: CatalogCategory,
    query?: string,
    limit = 200,
    /** только активные — для публичного каталога (совпадает с остатками в админке по тем же строкам БД) */
    activeOnly?: boolean,
    catalogSourceFilter?: string,
    sort?: string
  ) {
    const normalizedQuery = (query ?? "").trim().toLowerCase();
    const take = Math.min(Math.max(limit, 1), MAX_FRAMES_LIST);
    const sourceWhere =
      catalogSourceFilter && isFrameCatalogSource(catalogSourceFilter)
        ? { catalogSource: catalogSourceFilter }
        : {};
    const rows = await this.prisma.frameProfile.findMany({
      where: {
        ...(activeOnly === true ? { isActive: true } : {}),
        ...(category && { category }),
        ...sourceWhere,
        ...(normalizedQuery && {
          OR: [
            { sku: { contains: normalizedQuery, mode: "insensitive" } },
            { name: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        })
      },
      orderBy:
        sort === "source_sku"
          ? [{ catalogSource: "asc" }, { sku: "asc" }]
          : { sku: "asc" },
      take
    });
    return rows.map((r) => this.toCatalogItem(r));
  }

  async listMatboardInventory(query?: string, limit = 500, activeOnly?: boolean) {
    const normalizedQuery = (query ?? "").trim().toLowerCase();
    const take = Math.min(Math.max(limit, 1), 800);
    const rows = await this.prisma.matboardProfile.findMany({
      where: {
        ...(activeOnly === true ? { isActive: true } : {}),
        ...(normalizedQuery && {
          OR: [
            { sku: { contains: normalizedQuery, mode: "insensitive" } },
            { name: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        })
      },
      orderBy: { sku: "asc" },
      take
    });
    return rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      pricePerM2: Number(r.pricePerM2),
      imageUrl: r.imageUrl ?? "",
      isActive: r.isActive,
      stockM2: this.num(r.stockM2),
      minStockM2: r.minStockM2 == null ? null : this.num(r.minStockM2)
    }));
  }

  async listAccessoriesInventory(
    group?: "hanger" | "subframe" | "assembly_product" | "fit_type" | "stand_leg" | "finishing",
    query?: string,
    limit = 500
  ) {
    const normalizedQuery = (query ?? "").trim().toLowerCase();
    const take = Math.min(Math.max(limit, 1), 800);
    const rows = await this.prisma.accessoryItem.findMany({
      where: {
        excludeFromStock: false,
        ...(group ? { group } : {}),
        ...(normalizedQuery && {
          OR: [
            { code: { contains: normalizedQuery, mode: "insensitive" } },
            { name: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        })
      },
      orderBy: { code: "asc" },
      take
    });
    return rows.map((r) => ({
      code: r.code,
      group: r.group,
      name: r.name,
      price: Number(r.price),
      isActive: r.isActive,
      stockQty: this.num(r.stockQty),
      minStockQty: r.minStockQty == null ? null : this.num(r.minStockQty)
    }));
  }

  async listGlassInventory(query?: string, limit = 500) {
    const normalizedQuery = (query ?? "").trim().toLowerCase();
    const take = Math.min(Math.max(limit, 1), 800);
    const rows = await this.prisma.glassType.findMany({
      where: {
        excludeFromStock: false,
        ...(normalizedQuery && {
          OR: [
            { code: { contains: normalizedQuery, mode: "insensitive" } },
            { name: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        })
      },
      orderBy: { name: "asc" },
      take
    });
    return rows.map((r) => ({
      sku: r.code ?? r.id,
      name: r.name,
      stockM2: this.num(r.stockM2),
      minStockM2: r.minStockM2 == null ? null : this.num(r.minStockM2)
    }));
  }

  async listBackingInventory(query?: string, limit = 500) {
    const normalizedQuery = (query ?? "").trim().toLowerCase();
    const take = Math.min(Math.max(limit, 1), 800);
    const rows = await this.prisma.backingType.findMany({
      where: {
        excludeFromStock: false,
        ...(normalizedQuery && {
          OR: [
            { code: { contains: normalizedQuery, mode: "insensitive" } },
            { name: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        })
      },
      orderBy: { name: "asc" },
      take
    });
    return rows.map((r) => ({
      sku: r.code ?? r.id,
      name: r.name,
      stockM2: this.num(r.stockM2),
      minStockM2: r.minStockM2 == null ? null : this.num(r.minStockM2)
    }));
  }

  private async findGlassBySku(sku: string) {
    const s = (sku ?? "").trim();
    if (!s) return null;
    return this.prisma.glassType.findFirst({
      where: { OR: [{ code: s }, { id: s }] }
    });
  }

  private async findBackingBySku(sku: string) {
    const s = (sku ?? "").trim();
    if (!s) return null;
    return this.prisma.backingType.findFirst({
      where: { OR: [{ code: s }, { id: s }] }
    });
  }

  private lineKindToStockKind(lineKind: string | undefined): StockItemKind {
    const k = (lineKind ?? "frame").toString().trim().toLowerCase();
    switch (k) {
      case "frame":
        return StockItemKind.frame;
      case "matboard":
        return StockItemKind.matboard;
      case "accessory":
        return StockItemKind.accessory;
      case "glass":
        return StockItemKind.glass;
      case "backing":
        return StockItemKind.backing;
      case "showcase":
        return StockItemKind.showcase;
      default:
        throw new BadRequestException(`Неизвестный вид строки: ${lineKind ?? ""}`);
    }
  }

  async adjustStockFrame(
    sku: string,
    deltaMeters: number,
    reason: StockMovementReason,
    note: string | undefined,
    userId: string | undefined
  ) {
    if (!Number.isFinite(deltaMeters) || deltaMeters === 0) {
      throw new BadRequestException("Укажите ненулевое изменение, м");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.frameProfile.findUnique({ where: { sku } });
      if (!row) throw new NotFoundException("Багет не найден");
      const cur = this.num(row.stockMeters);
      const next = cur + deltaMeters;
      if (next < 0) {
        throw new BadRequestException(`Недостаточно остатка (есть ${cur.toFixed(3)} м)`);
      }
      await tx.frameProfile.update({
        where: { sku },
        data: { stockMeters: next }
      });
      await tx.stockMovement.create({
        data: {
          kind: StockItemKind.frame,
          sku,
          delta: new Prisma.Decimal(deltaMeters),
          unit: "m",
          reason,
          note: note?.trim() || null,
          createdByUserId: userId ?? null,
          receiptId: null
        }
      });
      return { ok: true as const, stockMeters: next };
    });
  }

  async adjustStockMatboard(
    sku: string,
    deltaM2: number,
    reason: StockMovementReason,
    note: string | undefined,
    userId: string | undefined
  ) {
    if (!Number.isFinite(deltaM2) || deltaM2 === 0) {
      throw new BadRequestException("Укажите ненулевое изменение, м²");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.matboardProfile.findUnique({ where: { sku } });
      if (!row) throw new NotFoundException("Паспарту не найдено");
      const cur = this.num(row.stockM2);
      const next = cur + deltaM2;
      if (next < 0) {
        throw new BadRequestException(`Недостаточно остатка (есть ${cur.toFixed(4)} м²)`);
      }
      await tx.matboardProfile.update({
        where: { sku },
        data: { stockM2: next }
      });
      await tx.stockMovement.create({
        data: {
          kind: StockItemKind.matboard,
          sku,
          delta: new Prisma.Decimal(deltaM2),
          unit: "m2",
          reason,
          note: note?.trim() || null,
          createdByUserId: userId ?? null,
          receiptId: null
        }
      });
      return { ok: true as const, stockM2: next };
    });
  }

  async adjustStockGlass(
    sku: string,
    deltaM2: number,
    reason: StockMovementReason,
    note: string | undefined,
    userId: string | undefined
  ) {
    if (!Number.isFinite(deltaM2) || deltaM2 === 0) {
      throw new BadRequestException("Укажите ненулевое изменение, м²");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.glassType.findFirst({
        where: { OR: [{ code: sku.trim() }, { id: sku.trim() }] }
      });
      if (!row) throw new NotFoundException("Стекло не найдено");
      if (row.excludeFromStock) {
        throw new BadRequestException("Это стекло не ведётся на складе — ручная корректировка недоступна.");
      }
      const cur = this.num(row.stockM2);
      const next = cur + deltaM2;
      if (next < 0) {
        throw new BadRequestException(`Недостаточно остатка (есть ${cur.toFixed(4)} м²)`);
      }
      const key = row.code ?? row.id;
      await tx.glassType.update({
        where: { id: row.id },
        data: { stockM2: next }
      });
      await tx.stockMovement.create({
        data: {
          kind: StockItemKind.glass,
          sku: key,
          delta: new Prisma.Decimal(deltaM2),
          unit: "m2",
          reason,
          note: note?.trim() || null,
          createdByUserId: userId ?? null,
          receiptId: null
        }
      });
      return { ok: true as const, stockM2: next };
    });
  }

  async adjustStockBacking(
    sku: string,
    deltaM2: number,
    reason: StockMovementReason,
    note: string | undefined,
    userId: string | undefined
  ) {
    if (!Number.isFinite(deltaM2) || deltaM2 === 0) {
      throw new BadRequestException("Укажите ненулевое изменение, м²");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.backingType.findFirst({
        where: { OR: [{ code: sku.trim() }, { id: sku.trim() }] }
      });
      if (!row) throw new NotFoundException("Задник не найден");
      if (row.excludeFromStock) {
        throw new BadRequestException("Этот задник не ведётся на складе — ручная корректировка недоступна.");
      }
      const cur = this.num(row.stockM2);
      const next = cur + deltaM2;
      if (next < 0) {
        throw new BadRequestException(`Недостаточно остатка (есть ${cur.toFixed(4)} м²)`);
      }
      const key = row.code ?? row.id;
      await tx.backingType.update({
        where: { id: row.id },
        data: { stockM2: next }
      });
      await tx.stockMovement.create({
        data: {
          kind: StockItemKind.backing,
          sku: key,
          delta: new Prisma.Decimal(deltaM2),
          unit: "m2",
          reason,
          note: note?.trim() || null,
          createdByUserId: userId ?? null,
          receiptId: null
        }
      });
      return { ok: true as const, stockM2: next };
    });
  }

  async adjustStockAccessory(
    code: string,
    deltaQty: number,
    reason: StockMovementReason,
    note: string | undefined,
    userId: string | undefined
  ) {
    if (!Number.isFinite(deltaQty) || deltaQty === 0) {
      throw new BadRequestException("Укажите ненулевое изменение, шт");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.accessoryItem.findUnique({ where: { code } });
      if (!row) throw new NotFoundException("Фурнитура не найдена");
      if (row.excludeFromStock) {
        throw new BadRequestException("Эта фурнитура не ведётся на складе — ручная корректировка недоступна.");
      }
      const cur = this.num(row.stockQty);
      const next = cur + deltaQty;
      if (next < 0) {
        throw new BadRequestException(`Недостаточно остатка (есть ${cur.toFixed(2)} шт)`);
      }
      await tx.accessoryItem.update({
        where: { code },
        data: { stockQty: next }
      });
      await tx.stockMovement.create({
        data: {
          kind: StockItemKind.accessory,
          sku: code,
          delta: new Prisma.Decimal(deltaQty),
          unit: "qty",
          reason,
          note: note?.trim() || null,
          createdByUserId: userId ?? null,
          receiptId: null
        }
      });
      return { ok: true as const, stockQty: next };
    });
  }

  async listStockMovements(kind: StockItemKind, sku?: string, limit = 80) {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        kind,
        ...(sku?.trim() && { sku: sku.trim() })
      },
      orderBy: { createdAt: "desc" },
      take
    });
    return rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      sku: m.sku,
      delta: this.num(m.delta),
      unit: m.unit,
      reason: m.reason,
      note: m.note,
      createdAt: m.createdAt.toISOString(),
      createdByUserId: m.createdByUserId,
      receiptId: m.receiptId
    }));
  }

  private toReceiptDto(r: {
    id: string;
    docNumber: string;
    status: StockReceiptStatus;
    comment: string | null;
    postedAt: Date | null;
    createdAt: Date;
    createdByUserId: string | null;
    lines: { id: string; kind: StockItemKind; sku: string; quantity: Prisma.Decimal; lineNo: number }[];
  }) {
    return {
      id: r.id,
      docNumber: r.docNumber,
      status: r.status,
      comment: r.comment,
      postedAt: r.postedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      createdByUserId: r.createdByUserId,
      lines: r.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        sku: l.sku,
        quantity: this.num(l.quantity),
        lineNo: l.lineNo
      }))
    };
  }

  private async allocReceiptDocNumber(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
      const doc = `ПОСТ-${day}-${rnd}`;
      const exists = await this.prisma.stockReceipt.findUnique({ where: { docNumber: doc } });
      if (!exists) return doc;
    }
    return `ПОСТ-${Date.now()}`;
  }

  async listStockReceipts(limit = 60) {
    const take = Math.min(Math.max(limit, 1), 150);
    const rows = await this.prisma.stockReceipt.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: { lines: { orderBy: { lineNo: "asc" } } }
    });
    return rows.map((r) => this.toReceiptDto(r));
  }

  async getStockReceipt(id: string) {
    const r = await this.prisma.stockReceipt.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } }
    });
    if (!r) throw new NotFoundException("Документ не найден");
    return this.toReceiptDto(r);
  }

  async createStockReceiptDraft(userId?: string) {
    const docNumber = await this.allocReceiptDocNumber();
    const r = await this.prisma.stockReceipt.create({
      data: {
        docNumber,
        createdByUserId: userId ?? null
      },
      include: { lines: { orderBy: { lineNo: "asc" } } }
    });
    return this.toReceiptDto(r);
  }

  async updateStockReceiptDraft(
    id: string,
    body: { comment?: string | null; lines: { kind: string; sku: string; quantity: number }[] }
  ) {
    const receipt = await this.prisma.stockReceipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException("Документ не найден");
    if (receipt.status !== StockReceiptStatus.draft) {
      throw new BadRequestException("Редактировать можно только черновик");
    }
    const lines = body.lines ?? [];
    for (const line of lines) {
      const sku = (line.sku ?? "").toString().trim();
      if (!sku) throw new BadRequestException("Укажите артикул в каждой строке");
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException("Количество должно быть больше нуля");
      const kind = this.lineKindToStockKind(line.kind);
      if (kind === StockItemKind.frame) {
        const f = await this.prisma.frameProfile.findUnique({ where: { sku } });
        if (!f) throw new BadRequestException(`Багет «${sku}» не найден в каталоге`);
      } else if (kind === StockItemKind.matboard) {
        const m = await this.prisma.matboardProfile.findUnique({ where: { sku } });
        if (!m) throw new BadRequestException(`Паспарту «${sku}» не найдено в каталоге`);
      } else if (kind === StockItemKind.glass) {
        const g = await this.findGlassBySku(sku);
        if (!g) throw new BadRequestException(`Стекло «${sku}» не найдено в справочнике материалов`);
        if (g.excludeFromStock) {
          throw new BadRequestException(
            `Стекло «${g.name}» не ведётся на складе (флаг в «Материалах»). Уберите строку из прихода.`
          );
        }
      } else if (kind === StockItemKind.backing) {
        const b = await this.findBackingBySku(sku);
        if (!b) throw new BadRequestException(`Задник «${sku}» не найден в справочнике материалов`);
        if (b.excludeFromStock) {
          throw new BadRequestException(
            `Задник «${b.name}» не ведётся на складе (флаг в «Материалах»). Уберите строку из прихода.`
          );
        }
      } else if (kind === StockItemKind.showcase) {
        const p = await this.prisma.showcaseProduct.findUnique({ where: { id: sku } });
        if (!p) throw new BadRequestException(`Товар витрины не найден (id «${sku}»)`);
        const iq = Math.floor(qty);
        if (iq < 1 || !Number.isFinite(qty)) {
          throw new BadRequestException("Для товара витрины укажите целое количество штук не меньше 1");
        }
      } else {
        const a = await this.prisma.accessoryItem.findUnique({ where: { code: sku } });
        if (!a) throw new BadRequestException(`Фурнитура «${sku}» не найдена в каталоге`);
        if (a.excludeFromStock) {
          throw new BadRequestException(
            `Фурнитура «${a.name}» не ведётся на складе (флаг в «Материалах»). Уберите строку из прихода.`
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.stockReceiptLine.deleteMany({ where: { receiptId: id } });
        if (lines.length > 0) {
        await tx.stockReceiptLine.createMany({
          data: lines.map((l, idx) => {
            const kind = this.lineKindToStockKind(l.kind);
            const qRaw = Number(l.quantity);
            const qStored =
              kind === StockItemKind.showcase
                ? Math.max(1, Math.floor(Number.isFinite(qRaw) ? qRaw : 0))
                : qRaw;
            return {
              receiptId: id,
              kind,
              sku: (l.sku ?? "").toString().trim(),
              quantity: new Prisma.Decimal(qStored),
              lineNo: idx + 1
            };
          })
        });
      }
      const c = body.comment;
      await tx.stockReceipt.update({
        where: { id },
        data: {
          ...(c !== undefined ? { comment: c === null || c === "" ? null : String(c).trim() } : {})
        }
      });
    });

    const full = await this.prisma.stockReceipt.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } }
    });
    return this.toReceiptDto(full!);
  }

  async deleteStockReceiptDraft(id: string) {
    const receipt = await this.prisma.stockReceipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException("Документ не найден");
    if (receipt.status !== StockReceiptStatus.draft) {
      throw new BadRequestException("Удалить можно только черновик");
    }
    await this.prisma.stockReceipt.delete({ where: { id } });
    return { ok: true as const };
  }

  async postStockReceipt(id: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.stockReceipt.findUnique({
        where: { id },
        include: { lines: { orderBy: { lineNo: "asc" } } }
      });
      if (!receipt) throw new NotFoundException("Документ не найден");
      if (receipt.status !== StockReceiptStatus.draft) {
        throw new BadRequestException("Документ уже проведён");
      }
      if (receipt.lines.length === 0) {
        throw new BadRequestException("Добавьте строки перед проведением");
      }
      const docRef = receipt.docNumber;
      for (const line of receipt.lines) {
        const qty = this.num(line.quantity);
        if (qty <= 0) throw new BadRequestException("Некорректное количество в строке");
        if (line.kind === StockItemKind.frame) {
          const row = await tx.frameProfile.findUnique({ where: { sku: line.sku } });
          if (!row) throw new BadRequestException(`Багет «${line.sku}» не найден`);
          const cur = this.num(row.stockMeters);
          const next = cur + qty;
          await tx.frameProfile.update({
            where: { sku: line.sku },
            data: { stockMeters: next }
          });
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.frame,
              sku: line.sku,
              delta: new Prisma.Decimal(qty),
              unit: "m",
              reason: StockMovementReason.purchase,
              note: `Поступление ${docRef}`,
              createdByUserId: userId ?? null,
              receiptId: id
            }
          });
        } else if (line.kind === StockItemKind.matboard) {
          const row = await tx.matboardProfile.findUnique({ where: { sku: line.sku } });
          if (!row) throw new BadRequestException(`Паспарту «${line.sku}» не найдено`);
          const cur = this.num(row.stockM2);
          const next = cur + qty;
          await tx.matboardProfile.update({
            where: { sku: line.sku },
            data: { stockM2: next }
          });
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.matboard,
              sku: line.sku,
              delta: new Prisma.Decimal(qty),
              unit: "m2",
              reason: StockMovementReason.purchase,
              note: `Поступление ${docRef}`,
              createdByUserId: userId ?? null,
              receiptId: id
            }
          });
        } else if (line.kind === StockItemKind.glass) {
          const row = await tx.glassType.findFirst({
            where: { OR: [{ code: line.sku }, { id: line.sku }] }
          });
          if (!row) throw new BadRequestException(`Стекло «${line.sku}» не найдено`);
          if (row.excludeFromStock) {
            throw new BadRequestException(
              `Стекло «${row.name}» не ведётся на складе — строку нельзя провести. Удалите её из прихода.`
            );
          }
          const cur = this.num(row.stockM2);
          const next = cur + qty;
          const key = row.code ?? row.id;
          await tx.glassType.update({
            where: { id: row.id },
            data: { stockM2: next }
          });
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.glass,
              sku: key,
              delta: new Prisma.Decimal(qty),
              unit: "m2",
              reason: StockMovementReason.purchase,
              note: `Поступление ${docRef}`,
              createdByUserId: userId ?? null,
              receiptId: id
            }
          });
        } else if (line.kind === StockItemKind.backing) {
          const row = await tx.backingType.findFirst({
            where: { OR: [{ code: line.sku }, { id: line.sku }] }
          });
          if (!row) throw new BadRequestException(`Задник «${line.sku}» не найден`);
          if (row.excludeFromStock) {
            throw new BadRequestException(
              `Задник «${row.name}» не ведётся на складе — строку нельзя провести. Удалите её из прихода.`
            );
          }
          const cur = this.num(row.stockM2);
          const next = cur + qty;
          const key = row.code ?? row.id;
          await tx.backingType.update({
            where: { id: row.id },
            data: { stockM2: next }
          });
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.backing,
              sku: key,
              delta: new Prisma.Decimal(qty),
              unit: "m2",
              reason: StockMovementReason.purchase,
              note: `Поступление ${docRef}`,
              createdByUserId: userId ?? null,
              receiptId: id
            }
          });
        } else if (line.kind === StockItemKind.showcase) {
          const add = Math.max(1, Math.floor(this.num(line.quantity)));
          const product = await tx.showcaseProduct.findUnique({ where: { id: line.sku } });
          if (!product) throw new BadRequestException(`Товар витрины «${line.sku}» не найден`);
          const next = product.stockQty + add;
          await tx.showcaseProduct.update({
            where: { id: line.sku },
            data: { stockQty: next, inStock: next > 0 }
          });
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.showcase,
              sku: line.sku,
              delta: new Prisma.Decimal(add),
              unit: "pcs",
              reason: StockMovementReason.purchase,
              note: `Поступление ${docRef}`,
              createdByUserId: userId ?? null,
              receiptId: id
            }
          });
        } else {
          const row = await tx.accessoryItem.findUnique({ where: { code: line.sku } });
          if (!row) throw new BadRequestException(`Фурнитура «${line.sku}» не найдена`);
          if (row.excludeFromStock) {
            throw new BadRequestException(
              `Фурнитура «${row.name}» не ведётся на складе — строку нельзя провести. Удалите её из прихода.`
            );
          }
          const cur = this.num(row.stockQty);
          const next = cur + qty;
          await tx.accessoryItem.update({
            where: { code: line.sku },
            data: { stockQty: next }
          });
          await tx.stockMovement.create({
            data: {
              kind: StockItemKind.accessory,
              sku: line.sku,
              delta: new Prisma.Decimal(qty),
              unit: "qty",
              reason: StockMovementReason.purchase,
              note: `Поступление ${docRef}`,
              createdByUserId: userId ?? null,
              receiptId: id
            }
          });
        }
      }
      await tx.stockReceipt.update({
        where: { id },
        data: { status: StockReceiptStatus.posted, postedAt: new Date() }
      });
      return { ok: true as const };
    });
  }
}
