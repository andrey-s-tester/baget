import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PromoCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.promoCode.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        discountPercent: true,
        discountAmount: true,
        isActive: true
      }
    });
    return rows.map((r) => ({
      code: r.code,
      discountPercent: r.discountPercent != null ? Number(r.discountPercent) : null,
      discountAmount: r.discountAmount != null ? Number(r.discountAmount) : null,
      isActive: r.isActive
    }));
  }

  async create(data: {
    code: string;
    discountPercent?: number | null;
    discountAmount?: number | null;
  }) {
    const code = data.code.trim().toUpperCase();
    await this.prisma.promoCode.create({
      data: {
        code,
        discountPercent: data.discountPercent ?? null,
        discountAmount: data.discountAmount ?? null,
        isActive: true
      }
    });
    return { ok: true };
  }

  async validate(code: string, storeId?: string | null) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return { valid: false };

    const row = await this.prisma.promoCode.findUnique({
      where: { code: normalized }
    });

    if (!row || !row.isActive) return { valid: false };
    if (row.validUntil && row.validUntil < new Date()) return { valid: false };
    if (row.storeId && storeId && row.storeId !== storeId) return { valid: false };

    return {
      valid: true,
      discountPercent: row.discountPercent != null ? Number(row.discountPercent) : null,
      discountAmount: row.discountAmount != null ? Number(row.discountAmount) : null
    };
  }

  async toggle(code: string, isActive: boolean) {
    const normalized = code.trim().toUpperCase();
    await this.prisma.promoCode.update({
      where: { code: normalized },
      data: { isActive }
    });
    return { ok: true };
  }
}
