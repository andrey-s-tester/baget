import { Injectable } from "@nestjs/common";
import { Prisma, type ShowcaseProduct } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_PRODUCTS = [
  {
    id: "art-001",
    title: "Тихая гавань",
    artist: "М. Орлова",
    sizeLabel: "40×60 см",
    priceRub: 6900,
    imageUrl: "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=900&q=80",
    description: "Пейзаж с мягким вечерним светом, оформлен в деревянный багет.",
    inStock: true
  },
  {
    id: "art-002",
    title: "Северный берег",
    artist: "А. Лебедев",
    sizeLabel: "50×70 см",
    priceRub: 8200,
    imageUrl: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=900&q=80",
    description: "Графичный морской сюжет в холодной палитре.",
    inStock: true
  },
  {
    id: "art-003",
    title: "Лавандовый ветер",
    artist: "Е. Нечаева",
    sizeLabel: "30×45 см",
    priceRub: 5400,
    imageUrl: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=900&q=80",
    description: "Интерьерная картина с акцентом на пастельные оттенки.",
    inStock: true
  }
];

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(p: ShowcaseProduct) {
    return {
      id: p.id,
      title: p.title,
      artist: p.artist,
      sizeLabel: p.sizeLabel,
      priceRub: Number(p.priceRub),
      imageUrl: p.imageUrl,
      description: p.description,
      stockQty: Math.max(0, Math.floor(Number(p.stockQty) || 0)),
      inStock: p.inStock,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    };
  }

  async list() {
    const rows = await this.prisma.showcaseProduct.findMany({
      orderBy: { createdAt: "desc" }
    });
    return rows.map((r) => this.toPublic(r));
  }

  async listActivePublic() {
    const rows = await this.prisma.showcaseProduct.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" }
    });
    return rows.map((r) => this.toPublic(r));
  }

  async ensureSeeded() {
    const total = await this.prisma.showcaseProduct.count();
    if (total > 0) return;
    await this.prisma.showcaseProduct.createMany({
      data: DEFAULT_PRODUCTS.map((src) => ({
        id: src.id,
        title: src.title,
        artist: src.artist,
        sizeLabel: src.sizeLabel,
        priceRub: src.priceRub,
        imageUrl: src.imageUrl,
        description: src.description,
        stockQty: src.inStock ? 1 : 0,
        inStock: src.inStock,
        isActive: true
      })),
      skipDuplicates: true
    });
  }

  async create(body: {
    title: string;
    artist?: string;
    sizeLabel?: string;
    priceRub?: number;
    imageUrl?: string;
    description?: string | null;
    stockQty?: number;
    inStock?: boolean;
    isActive?: boolean;
  }) {
    const title = body.title?.trim();
    if (!title) return { ok: false as const, message: "Укажите название" };
    const artist = body.artist?.trim() || "Не указан";
    const sizeLabel = body.sizeLabel?.trim() || "—";
    const imageUrl = body.imageUrl?.trim() || "";
    if (!imageUrl) return { ok: false as const, message: "Укажите URL изображения" };
    const priceRub = Math.max(0, Number(body.priceRub) || 0);
    let stockQty = Math.max(0, Math.floor(Number(body.stockQty) ?? NaN));
    if (!Number.isFinite(stockQty)) {
      stockQty = body.inStock !== false ? 1 : 0;
    }
    const inStock = stockQty > 0;
    await this.prisma.showcaseProduct.create({
      data: {
        title,
        artist,
        sizeLabel,
        priceRub,
        imageUrl,
        description: body.description?.trim() || null,
        stockQty,
        inStock,
        isActive: body.isActive !== false
      }
    });
    return { ok: true as const };
  }

  async update(
    id: string,
    body: Partial<{
      title: string;
      artist: string;
      sizeLabel: string;
      priceRub: number;
      imageUrl: string;
      description: string | null;
      stockQty: number;
      inStock: boolean;
      isActive: boolean;
    }>
  ) {
    const existing = await this.prisma.showcaseProduct.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) return { ok: false as const, message: "Товар не найден" };

    const data: Prisma.ShowcaseProductUpdateInput = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.artist !== undefined) data.artist = body.artist.trim() || "Не указан";
    if (body.sizeLabel !== undefined) data.sizeLabel = body.sizeLabel.trim() || "—";
    if (body.priceRub !== undefined) data.priceRub = Math.max(0, Number(body.priceRub) || 0);
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.stockQty !== undefined) {
      const sq = Math.max(0, Math.floor(Number(body.stockQty) || 0));
      data.stockQty = sq;
      data.inStock = sq > 0;
    } else if (body.inStock !== undefined) {
      data.inStock = body.inStock;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;

    if (Object.keys(data).length === 0) return { ok: true as const };
    await this.prisma.showcaseProduct.update({ where: { id }, data });
    return { ok: true as const };
  }

  async delete(id: string) {
    await this.prisma.showcaseProduct.deleteMany({ where: { id } });
    return { ok: true as const };
  }
}
