import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { StockItemKind, StockMovementReason } from "@prisma/client";
import { BACKOFFICE_ROLES } from "../auth/backoffice-role-sets";
import { Public, Roles } from "../auth/auth.decorators";
import { CatalogService } from "./catalog.service";

type ReqWithUser = { user?: { id: string } };

type Category = "plastic" | "wood" | "aluminum";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("inventory/matboard")
  @Roles(...BACKOFFICE_ROLES)
  async matboardInventory(@Query("q") q?: string, @Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : 500;
    return this.catalogService.listMatboardInventory(q, Number.isFinite(parsedLimit) ? parsedLimit : 500);
  }

  @Get("inventory/glass")
  @Roles(...BACKOFFICE_ROLES)
  async glassInventory(@Query("q") q?: string, @Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : 500;
    return this.catalogService.listGlassInventory(q, Number.isFinite(parsedLimit) ? parsedLimit : 500);
  }

  @Get("inventory/backing")
  @Roles(...BACKOFFICE_ROLES)
  async backingInventory(@Query("q") q?: string, @Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : 500;
    return this.catalogService.listBackingInventory(q, Number.isFinite(parsedLimit) ? parsedLimit : 500);
  }

  @Get("inventory/accessories")
  @Roles(...BACKOFFICE_ROLES)
  async accessoriesInventory(
    @Query("group")
    group?: "hanger" | "subframe" | "assembly_product" | "fit_type" | "stand_leg" | "finishing",
    @Query("q") q?: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : 500;
    return this.catalogService.listAccessoriesInventory(
      group,
      q,
      Number.isFinite(parsedLimit) ? parsedLimit : 500
    );
  }

  @Get("inventory/frames")
  @Roles(...BACKOFFICE_ROLES)
  async framesInventory(
    @Query("category") category?: Category,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
    @Query("catalogSource") catalogSource?: string,
    @Query("sort") sort?: string
  ) {
    const parsedLimit = limit ? Number(limit) : 200;
    return this.catalogService.listFramesInventory(
      category,
      q,
      Number.isFinite(parsedLimit) ? parsedLimit : 200,
      false,
      catalogSource?.trim() || undefined,
      sort?.trim() || undefined
    );
  }

  @Get("stock/movements")
  @Roles(...BACKOFFICE_ROLES)
  async stockMovements(
    @Query("kind") kind: string,
    @Query("sku") sku?: string,
    @Query("limit") limit?: string
  ) {
    const k =
      kind === "matboard"
        ? StockItemKind.matboard
        : kind === "accessory"
          ? StockItemKind.accessory
          : kind === "glass"
            ? StockItemKind.glass
            : kind === "backing"
              ? StockItemKind.backing
              : kind === "showcase"
                ? StockItemKind.showcase
                : StockItemKind.frame;
    const parsedLimit = limit ? Number(limit) : 80;
    return this.catalogService.listStockMovements(k, sku, Number.isFinite(parsedLimit) ? parsedLimit : 80);
  }

  @Get("stock/receipts")
  @Roles(...BACKOFFICE_ROLES)
  async listReceipts(@Query("limit") limit?: string) {
    const parsed = limit ? Number(limit) : 60;
    return this.catalogService.listStockReceipts(Number.isFinite(parsed) ? parsed : 60);
  }

  @Post("stock/receipts")
  @Roles(...BACKOFFICE_ROLES)
  async createReceipt(@Req() req: ReqWithUser) {
    return this.catalogService.createStockReceiptDraft(req.user?.id);
  }

  @Get("stock/receipts/:id")
  @Roles(...BACKOFFICE_ROLES)
  async getReceipt(@Param("id") id: string) {
    return this.catalogService.getStockReceipt(id);
  }

  @Patch("stock/receipts/:id")
  @Roles(...BACKOFFICE_ROLES)
  async updateReceipt(
    @Param("id") id: string,
    @Body() body: { comment?: string | null; lines?: { kind: string; sku: string; quantity: number }[] }
  ) {
    return this.catalogService.updateStockReceiptDraft(id, {
      comment: body.comment,
      lines: body.lines ?? []
    });
  }

  @Delete("stock/receipts/:id")
  @Roles(...BACKOFFICE_ROLES)
  async deleteReceipt(@Param("id") id: string) {
    return this.catalogService.deleteStockReceiptDraft(id);
  }

  @Post("stock/receipts/:id/post")
  @Roles(...BACKOFFICE_ROLES)
  async postReceipt(@Param("id") id: string, @Req() req: ReqWithUser) {
    return this.catalogService.postStockReceipt(id, req.user?.id);
  }

  @Post("stock/move")
  @Roles(...BACKOFFICE_ROLES)
  async stockMove(
    @Req() req: ReqWithUser,
    @Body()
    body: {
      kind?: string;
      sku?: string;
      delta?: number;
      reason?: string;
      note?: string;
    }
  ) {
    const sku = (body.sku ?? "").toString().trim();
    if (!sku) return { ok: false, message: "sku обязателен" };
    const delta = Number(body.delta);
    const reasonStr = (body.reason ?? "manual").toString().toLowerCase();
    const allowed = Object.values(StockMovementReason) as string[];
    const reason = allowed.includes(reasonStr)
      ? (reasonStr as StockMovementReason)
      : StockMovementReason.manual;
    const note = body.note != null ? String(body.note) : undefined;
    const userId = req.user?.id;
    if (body.kind === "matboard") {
      return this.catalogService.adjustStockMatboard(sku, delta, reason, note, userId);
    }
    if (body.kind === "glass") {
      return this.catalogService.adjustStockGlass(sku, delta, reason, note, userId);
    }
    if (body.kind === "backing") {
      return this.catalogService.adjustStockBacking(sku, delta, reason, note, userId);
    }
    if (body.kind === "accessory") {
      return this.catalogService.adjustStockAccessory(sku, delta, reason, note, userId);
    }
    return this.catalogService.adjustStockFrame(sku, delta, reason, note, userId);
  }

  @Public()
  @Get("matboard")
  @Header("Cache-Control", "no-store, must-revalidate")
  async matboard(@Query("q") q?: string, @Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : 200;
    return this.catalogService.listMatboard(q, Number.isFinite(parsedLimit) ? parsedLimit : 200);
  }

  @Patch("matboard")
  @Roles(...BACKOFFICE_ROLES)
  async updateMatboard(@Body() body: { findBySku?: string; sku?: string } & Record<string, unknown>) {
    const sku = (body.findBySku ?? body.sku ?? "").toString().trim();
    if (!sku) return { ok: false };
    const data: Record<string, unknown> = {};
    if (body.name != null) data.name = String(body.name);
    if (body.pricePerM2 != null) data.pricePerM2 = Math.max(0, Math.round(Number(body.pricePerM2)) || 0);
    if (body.isActive != null) data.isActive = Boolean(body.isActive);
    if (body.imageUrl !== undefined) data.imageUrl = String(body.imageUrl ?? "");
    if (body.sku != null && body.sku !== sku) data.newSku = String(body.sku).trim();
    if (body.stockM2 != null) data.stockM2 = Math.max(0, Number(body.stockM2) || 0);
    if (body.minStockM2 !== undefined) {
      data.minStockM2 =
        body.minStockM2 === null || body.minStockM2 === ""
          ? null
          : Math.max(0, Number(body.minStockM2) || 0);
    }
    await this.catalogService.updateMatboard(sku, data as Parameters<typeof this.catalogService.updateMatboard>[1]);
    return { ok: true };
  }

  @Post("matboard")
  @Roles(...BACKOFFICE_ROLES)
  async createMatboard(@Body() body: Record<string, unknown>) {
    const sku = typeof body.sku === "string" ? body.sku.trim() : undefined;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const pricePerM2 = Math.max(0, Math.round(Number(body.pricePerM2)) || 5000);
    const isActive = body.isActive !== false;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;
    const stockM2 = body.stockM2 != null ? Number(body.stockM2) : undefined;
    const minStockM2 =
      body.minStockM2 === undefined
        ? undefined
        : body.minStockM2 === null || body.minStockM2 === ""
          ? null
          : Math.max(0, Number(body.minStockM2) || 0);
    return this.catalogService.createMatboard({ sku, name, pricePerM2, imageUrl, isActive, stockM2, minStockM2 });
  }

  @Delete("matboard")
  @Roles(...BACKOFFICE_ROLES)
  async deleteMatboard(@Body() body: { sku?: string }) {
    const sku = (body.sku ?? "").toString().trim();
    if (!sku) return { ok: false };
    await this.catalogService.deleteMatboard(sku);
    return { ok: true };
  }

  @Public()
  @Get("frames")
  @Header("Cache-Control", "no-store, must-revalidate")
  async frames(
    @Query("category") category?: Category,
    @Query("q") q?: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = limit ? Number(limit) : 60;
    return this.catalogService.listFrames(category, q, Number.isFinite(parsedLimit) ? parsedLimit : 60);
  }

  @Patch("frames")
  @Roles(...BACKOFFICE_ROLES)
  async updateFrame(@Body() body: { findBySku?: string; sku?: string } & Record<string, unknown>) {
    const sku = (body.findBySku ?? body.sku ?? "").toString().trim();
    if (!sku) return { ok: false };
    const data: Record<string, unknown> = {};
    if (body.name != null) data.name = String(body.name);
    if (body.category != null && ["wood", "plastic", "aluminum"].includes(String(body.category))) data.category = body.category;
    if (body.widthMm != null) data.widthMm = Math.max(1, Math.round(Number(body.widthMm)) || 0);
    if (body.widthWithoutQuarterMm != null) data.widthWithoutQuarterMm = Math.max(0, Math.round(Number(body.widthWithoutQuarterMm)) || 0);
    if (body.retailPriceMeter != null) data.retailPriceMeter = Math.max(0, Math.round(Number(body.retailPriceMeter)) || 0);
    if (body.isActive != null) data.isActive = Boolean(body.isActive);
    if (body.imageUrl !== undefined) data.imageUrl = String(body.imageUrl ?? "");
    if (body.previewImageUrl !== undefined) data.previewImageUrl = String(body.previewImageUrl ?? "");
    if (body.stockMeters != null) data.stockMeters = Math.max(0, Number(body.stockMeters) || 0);
    if (body.minStockMeters !== undefined) {
      data.minStockMeters =
        body.minStockMeters === null || body.minStockMeters === ""
          ? null
          : Math.max(0, Number(body.minStockMeters) || 0);
    }
    if (body.catalogSource != null && typeof body.catalogSource === "string") {
      data.catalogSource = body.catalogSource.trim() as
        | "bagetnaya_masterskaya"
        | "baget_optom_ua"
        | "svitart_net"
        | "manual";
    }
    await this.catalogService.updateFrame(sku, data as Parameters<typeof this.catalogService.updateFrame>[1]);
    return { ok: true };
  }

  @Post("frames")
  @Roles(...BACKOFFICE_ROLES)
  async createFrame(@Body() body: Record<string, unknown>) {
    const sku = (body.sku ?? `NEW-${Date.now()}`).toString().trim();
    const name = (body.name ?? "Новый багет").toString().trim();
    const category = ["wood", "plastic", "aluminum"].includes(String(body.category ?? "")) ? (body.category as Category) : "plastic";
    const widthMm = Math.max(1, Math.round(Number(body.widthMm)) || 50);
    const widthWithoutQuarterMm = body.widthWithoutQuarterMm != null ? Math.round(Number(body.widthWithoutQuarterMm)) || widthMm - 6 : undefined;
    const retailPriceMeter = Math.max(0, Math.round(Number(body.retailPriceMeter)) || 5000);
    const isActive = body.isActive !== false;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;
    const previewImageUrl = typeof body.previewImageUrl === "string" ? body.previewImageUrl : undefined;
    const stockMeters = body.stockMeters != null ? Number(body.stockMeters) : undefined;
    const minStockMeters =
      body.minStockMeters === undefined
        ? undefined
        : body.minStockMeters === null || body.minStockMeters === ""
          ? null
          : Math.max(0, Number(body.minStockMeters) || 0);
    const catalogSource =
      typeof body.catalogSource === "string" && body.catalogSource.trim()
        ? body.catalogSource.trim()
        : undefined;
    return this.catalogService.createFrame({
      sku,
      name,
      category,
      catalogSource,
      widthMm,
      widthWithoutQuarterMm,
      retailPriceMeter,
      imageUrl,
      previewImageUrl,
      isActive,
      stockMeters,
      minStockMeters
    });
  }

  @Delete("frames")
  @Roles(...BACKOFFICE_ROLES)
  async deleteFrame(@Body() body: { sku?: string; skus?: unknown }) {
    const raw = body.skus;
    if (Array.isArray(raw) && raw.length > 0) {
      return this.catalogService.deleteFramesBulk(raw as string[]);
    }
    const sku = (body.sku ?? "").toString().trim();
    if (!sku) return { ok: false };
    await this.catalogService.deleteFrame(sku);
    return { ok: true };
  }
}
