import { Body, Controller, Delete, Get, Patch, Post } from "@nestjs/common";
import { AccessoryPriceUnit } from "@prisma/client";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { MaterialsService } from "./materials.service";

function accPriceUnit(v: unknown): AccessoryPriceUnit {
  return v === "linear_meter" ? AccessoryPriceUnit.linear_meter : AccessoryPriceUnit.piece;
}

@Controller("materials")
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Public()
  @Get()
  getMaterials() {
    return this.materialsService.getMaterials();
  }

  @Patch()
  @Roles(...BACKOFFICE_ROLES)
  async updateMaterials(@Body() body: Record<string, unknown>) {
    const data: Parameters<typeof this.materialsService.updateMaterials>[0] = {};
    if (body.matboard && typeof body.matboard === "object") {
      const m = body.matboard as Record<string, unknown>;
      data.matboard = {
        name: typeof m.name === "string" ? m.name : undefined,
        pricePerM2: typeof m.pricePerM2 === "number" ? m.pricePerM2 : undefined,
        note: typeof m.note === "string" ? m.note : undefined
      };
    }
    if (Array.isArray(body.glass)) {
      data.glass = body.glass.map((g: unknown) => {
        const x = g as Record<string, unknown>;
        return {
          id: String(x.id ?? ""),
          name: String(x.name ?? ""),
          pricePerM2: Number(x.pricePerM2 ?? 0),
          excludeFromStock: x.excludeFromStock === true
        };
      });
    }
    if (Array.isArray(body.backing)) {
      data.backing = body.backing.map((b: unknown) => {
        const x = b as Record<string, unknown>;
        return {
          id: String(x.id ?? ""),
          name: String(x.name ?? ""),
          pricePerM2: x.pricePerM2 != null ? Number(x.pricePerM2) : null,
          note: typeof x.note === "string" ? x.note : undefined,
          excludeFromStock: x.excludeFromStock === true
        };
      });
    }
    if (Array.isArray(body.hangers)) {
      data.hangers = body.hangers.map((h: unknown) => {
        const x = h as Record<string, unknown>;
        return {
          id: String(x.id ?? ""),
          name: String(x.name ?? ""),
          price: Number(x.price ?? 0),
          excludeFromStock: x.excludeFromStock === true
        };
      });
    }
    const mapAcc = (arr: unknown) =>
      Array.isArray(arr)
        ? arr.map((h: unknown) => {
            const x = h as Record<string, unknown>;
            return {
              id: String(x.id ?? ""),
              name: String(x.name ?? ""),
              price: Number(x.price ?? 0),
              priceUnit: accPriceUnit(x.priceUnit),
              excludeFromStock: x.excludeFromStock === true
            };
          })
        : undefined;
    data.subframes = mapAcc(body.subframes);
    data.assemblyProducts = mapAcc(body.assemblyProducts);
    data.standLegs = mapAcc(body.standLegs);
    data.finishings = mapAcc(body.finishings);
    const result = await this.materialsService.updateMaterials(data);
    return { ok: true, data: result };
  }

  @Post()
  @Roles(...BACKOFFICE_ROLES)
  addMaterial(
    @Body()
    body: {
      type:
        | "glass"
        | "backing"
        | "hanger"
        | "subframe"
        | "assembly_product"
        | "stand_leg"
        | "finishing";
      item: Record<string, unknown>;
    }
  ) {
    const item = body.item as Record<string, unknown>;
    const puRaw = item.priceUnit;
    return this.materialsService.addMaterial(body.type, {
      id: typeof item.id === "string" ? item.id : undefined,
      name: String(item.name ?? ""),
      pricePerM2: item.pricePerM2 != null ? Number(item.pricePerM2) : null,
      note: typeof item.note === "string" ? item.note : undefined,
      excludeFromStock: item.excludeFromStock === true,
      priceUnit:
        puRaw === "linear_meter"
          ? AccessoryPriceUnit.linear_meter
          : puRaw === "piece"
            ? AccessoryPriceUnit.piece
            : undefined
    });
  }

  @Delete()
  @Roles(...BACKOFFICE_ROLES)
  deleteMaterial(
    @Body()
    body: {
      type:
        | "glass"
        | "backing"
        | "hanger"
        | "subframe"
        | "assembly_product"
        | "stand_leg"
        | "finishing";
      id: string;
    }
  ) {
    return this.materialsService.deleteMaterial(body.type, body.id);
  }
}
