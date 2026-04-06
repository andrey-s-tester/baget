import { Injectable } from "@nestjs/common";
import { AccessoryGroup, AccessoryPriceUnit } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMaterials(data: {
    matboard?: { name?: string; pricePerM2?: number; note?: string };
    glass?: { id: string; name: string; pricePerM2: number; excludeFromStock?: boolean }[];
    backing?: { id: string; name: string; pricePerM2: number | null; note?: string; excludeFromStock?: boolean }[];
    hangers?: { id: string; name: string; price: number; excludeFromStock?: boolean }[];
    subframes?: { id: string; name: string; price: number; priceUnit?: AccessoryPriceUnit; excludeFromStock?: boolean }[];
    assemblyProducts?: { id: string; name: string; price: number; priceUnit?: AccessoryPriceUnit; excludeFromStock?: boolean }[];
    standLegs?: { id: string; name: string; price: number; priceUnit?: AccessoryPriceUnit; excludeFromStock?: boolean }[];
    finishings?: { id: string; name: string; price: number; priceUnit?: AccessoryPriceUnit; excludeFromStock?: boolean }[];
  }) {
    if (data.matboard) {
      const m = await this.prisma.matboardType.findFirst();
      if (m) {
        await this.prisma.matboardType.update({
          where: { id: m.id },
          data: {
            ...(data.matboard.name != null && { name: data.matboard.name }),
            ...(data.matboard.pricePerM2 != null && { pricePerM2: data.matboard.pricePerM2 }),
            ...(data.matboard.note !== undefined && { note: data.matboard.note })
          }
        });
      } else {
        await this.prisma.matboardType.create({
          data: {
            name: data.matboard.name ?? "Паспарту",
            pricePerM2: data.matboard.pricePerM2 ?? 14552,
            note: data.matboard.note ?? null
          }
        });
      }
    }
    if (data.glass) {
      for (const g of data.glass) {
        const ex = g.excludeFromStock === true;
        const existing = await this.prisma.glassType.findFirst({
          where: { OR: [{ code: g.id }, { id: g.id }] }
        });
        if (existing) {
          await this.prisma.glassType.update({
            where: { id: existing.id },
            data: {
              name: g.name,
              pricePerM2: g.pricePerM2,
              excludeFromStock: ex,
              ...(existing.code == null ? { code: g.id } : {})
            }
          });
        } else {
          await this.prisma.glassType.create({
            data: {
              code: g.id,
              name: g.name,
              pricePerM2: g.pricePerM2,
              excludeFromStock: ex
            }
          });
        }
      }
    }
    if (data.backing) {
      for (const b of data.backing) {
        const ex = b.excludeFromStock === true;
        const existing = await this.prisma.backingType.findFirst({
          where: { OR: [{ code: b.id }, { id: b.id }] }
        });
        if (existing) {
          await this.prisma.backingType.update({
            where: { id: existing.id },
            data: {
              name: b.name,
              pricePerM2: b.pricePerM2,
              note: b.note ?? null,
              excludeFromStock: ex,
              ...(existing.code == null ? { code: b.id } : {})
            }
          });
        } else {
          await this.prisma.backingType.create({
            data: {
              code: b.id,
              name: b.name,
              pricePerM2: b.pricePerM2,
              note: b.note ?? null,
              excludeFromStock: ex
            }
          });
        }
      }
    }
    if (data.hangers) {
      for (const h of data.hangers) {
        const code = h.id;
        const ex = h.excludeFromStock === true;
        await this.prisma.accessoryItem.upsert({
          where: { code },
          create: { code, group: "hanger", name: h.name, price: h.price, excludeFromStock: ex },
          update: { name: h.name, price: h.price, excludeFromStock: ex }
        });
      }
    }
    const accessoryPatches: {
      items?: { id: string; name: string; price: number; priceUnit?: AccessoryPriceUnit; excludeFromStock?: boolean }[];
      group: AccessoryGroup;
    }[] = [
      { items: data.subframes, group: "subframe" },
      { items: data.assemblyProducts, group: "assembly_product" },
      { items: data.standLegs, group: "stand_leg" },
      { items: data.finishings, group: "finishing" }
    ];
    for (const { items, group } of accessoryPatches) {
      if (!items) continue;
      for (const h of items) {
        const code = h.id;
        const priceUnit = h.priceUnit ?? AccessoryPriceUnit.piece;
        const ex = h.excludeFromStock === true;
        await this.prisma.accessoryItem.upsert({
          where: { code },
          create: { code, group, name: h.name, price: h.price, priceUnit, excludeFromStock: ex },
          update: { name: h.name, price: h.price, group, priceUnit, excludeFromStock: ex }
        });
      }
    }
    return this.getMaterials();
  }

  async addMaterial(
    type:
      | "glass"
      | "backing"
      | "hanger"
      | "subframe"
      | "assembly_product"
      | "stand_leg"
      | "finishing",
    item: {
      id?: string;
      name: string;
      pricePerM2: number | null;
      note?: string;
      priceUnit?: AccessoryPriceUnit;
      excludeFromStock?: boolean;
    }
  ) {
    const ex = item.excludeFromStock === true;
    const code = item.id || (type === "glass" ? `glass-${Date.now()}` : `backing-${Date.now()}`);
    if (type === "glass") {
      await this.prisma.glassType.create({
        data: { code, name: item.name, pricePerM2: item.pricePerM2 ?? 0, excludeFromStock: ex }
      });
      return { ok: true, id: code };
    } else if (type === "backing") {
      await this.prisma.backingType.create({
        data: {
          code,
          name: item.name,
          pricePerM2: item.pricePerM2,
          note: item.note ?? null,
          excludeFromStock: ex
        }
      });
      return { ok: true, id: code };
    } else {
      const accCode = item.id || `${type}-${Date.now()}`;
      const pu =
        item.priceUnit ??
        (type === "subframe" || type === "finishing"
          ? AccessoryPriceUnit.linear_meter
          : AccessoryPriceUnit.piece);
      await this.prisma.accessoryItem.create({
        data: {
          code: accCode,
          group: type,
          name: item.name,
          price: item.pricePerM2 ?? 0,
          priceUnit: pu,
          excludeFromStock: ex
        }
      });
      return { ok: true, id: accCode };
    }
  }

  async deleteMaterial(
    type:
      | "glass"
      | "backing"
      | "hanger"
      | "subframe"
      | "assembly_product"
      | "stand_leg"
      | "finishing",
    id: string
  ) {
    if (type === "glass") {
      await this.prisma.glassType.deleteMany({
        where: { OR: [{ code: id }, { id }] }
      });
    } else if (type === "backing") {
      await this.prisma.backingType.deleteMany({
        where: { OR: [{ code: id }, { id }] }
      });
    } else {
      await this.prisma.accessoryItem.deleteMany({
        where: { code: id, group: type as AccessoryGroup }
      });
    }
    return { ok: true };
  }

  async getMaterials() {
    const [matboard, glass, backing, hangers, subframes, assemblyProducts, standLegs, finishings] =
      await Promise.all([
      this.prisma.matboardType.findFirst({
        where: { isActive: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.glassType.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.backingType.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.accessoryItem.findMany({
        where: { isActive: true, group: "hanger" },
        orderBy: { name: "asc" }
      }),
      this.prisma.accessoryItem.findMany({
        where: { isActive: true, group: "subframe" },
        orderBy: { name: "asc" }
      }),
      this.prisma.accessoryItem.findMany({
        where: { isActive: true, group: "assembly_product" },
        orderBy: { name: "asc" }
      }),
      this.prisma.accessoryItem.findMany({
        where: { isActive: true, group: "stand_leg" },
        orderBy: { name: "asc" }
      }),
      this.prisma.accessoryItem.findMany({
        where: { isActive: true, group: "finishing" },
        orderBy: { name: "asc" }
      })
    ]);

    return {
      matboard: matboard
        ? {
            name: matboard.name,
            pricePerM2: Number(matboard.pricePerM2),
            note: matboard.note ?? "При включённом паспарту"
          }
        : { name: "Паспарту", pricePerM2: 14552, note: "При включённом паспарту" },
      glass: glass.map((g) => ({
        id: g.code ?? g.id,
        name: g.name,
        pricePerM2: Number(g.pricePerM2),
        stockM2: g.stockM2 != null ? Number(g.stockM2) : 0,
        excludeFromStock: g.excludeFromStock === true
      })),
      backing: backing.map((b) => ({
        id: b.code ?? b.id,
        name: b.name,
        pricePerM2: b.pricePerM2 != null ? Number(b.pricePerM2) : null,
        note: b.note ?? "",
        stockM2: b.stockM2 != null ? Number(b.stockM2) : 0,
        excludeFromStock: b.excludeFromStock === true
      })),
      hangers: hangers.map((h) => ({
        id: h.code,
        name: h.name,
        price: Number(h.price),
        stockQty: Number(h.stockQty),
        excludeFromStock: h.excludeFromStock === true
      })),
      subframes: subframes.map((h) => ({
        id: h.code,
        name: h.name,
        price: Number(h.price),
        priceUnit: h.priceUnit,
        stockQty: Number(h.stockQty),
        excludeFromStock: h.excludeFromStock === true
      })),
      assemblyProducts: assemblyProducts.map((h) => ({
        id: h.code,
        name: h.name,
        price: Number(h.price),
        priceUnit: h.priceUnit,
        stockQty: Number(h.stockQty),
        excludeFromStock: h.excludeFromStock === true
      })),
      standLegs: standLegs.map((h) => ({
        id: h.code,
        name: h.name,
        price: Number(h.price),
        priceUnit: h.priceUnit,
        stockQty: Number(h.stockQty),
        excludeFromStock: h.excludeFromStock === true
      })),
      finishings: finishings.map((h) => ({
        id: h.code,
        name: h.name,
        price: Number(h.price),
        priceUnit: h.priceUnit,
        stockQty: Number(h.stockQty),
        excludeFromStock: h.excludeFromStock === true
      }))
    };
  }
}
