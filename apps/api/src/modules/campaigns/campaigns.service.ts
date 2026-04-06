import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type CampaignRow = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Используем SQL, чтобы не зависеть от перегенерации клиента после добавления модели. */
@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  private rowToPublic(c: CampaignRow) {
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      isActive: c.isActive,
      validFrom: c.validFrom?.toISOString() ?? null,
      validUntil: c.validUntil?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString()
    };
  }

  async listActivePublic() {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<CampaignRow[]>(
      Prisma.sql`
        SELECT id, title, description, "isActive", "validFrom", "validUntil", "createdAt", "updatedAt"
        FROM "MarketingCampaign"
        WHERE "isActive" = true
          AND ("validFrom" IS NULL OR "validFrom" <= ${now})
          AND ("validUntil" IS NULL OR "validUntil" >= ${now})
        ORDER BY "createdAt" DESC
      `
    );
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      validFrom: c.validFrom?.toISOString() ?? null,
      validUntil: c.validUntil?.toISOString() ?? null
    }));
  }

  async list() {
    const rows = await this.prisma.$queryRaw<CampaignRow[]>(
      Prisma.sql`
        SELECT id, title, description, "isActive", "validFrom", "validUntil", "createdAt", "updatedAt"
        FROM "MarketingCampaign"
        ORDER BY "createdAt" DESC
      `
    );
    return rows.map((c) => this.rowToPublic(c));
  }

  async create(body: {
    title: string;
    description?: string | null;
    isActive?: boolean;
    validFrom?: string | null;
    validUntil?: string | null;
  }) {
    const title = body.title?.trim();
    if (!title) {
      return { ok: false as const, message: "Укажите название" };
    }
    const id = randomUUID();
    const isActive = body.isActive !== false;
    const description = body.description?.trim() || null;
    const validFrom = body.validFrom ? new Date(body.validFrom) : null;
    const validUntil = body.validUntil ? new Date(body.validUntil) : null;

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "MarketingCampaign" (id, title, description, "isActive", "validFrom", "validUntil", "createdAt", "updatedAt")
        VALUES (${id}, ${title}, ${description}, ${isActive}, ${validFrom}, ${validUntil}, NOW(), NOW())
      `
    );
    return { ok: true as const };
  }

  async update(
    id: string,
    body: Partial<{
      title: string;
      description: string | null;
      isActive: boolean;
      validFrom: string | null;
      validUntil: string | null;
    }>
  ) {
    const [existing] = await this.prisma.$queryRaw<CampaignRow[]>(
      Prisma.sql`SELECT id FROM "MarketingCampaign" WHERE id = ${id} LIMIT 1`
    );
    if (!existing) {
      return { ok: false as const, message: "Не найдена" };
    }

    const sets: Prisma.Sql[] = [];
    if (body.title !== undefined) {
      const t = body.title.trim();
      sets.push(Prisma.sql`title = ${t}`);
    }
    if (body.description !== undefined) {
      sets.push(
        Prisma.sql`description = ${body.description?.trim() || null}`
      );
    }
    if (body.isActive !== undefined) {
      sets.push(Prisma.sql`"isActive" = ${body.isActive}`);
    }
    if (body.validFrom !== undefined) {
      const v = body.validFrom ? new Date(body.validFrom) : null;
      sets.push(Prisma.sql`"validFrom" = ${v}`);
    }
    if (body.validUntil !== undefined) {
      const v = body.validUntil ? new Date(body.validUntil) : null;
      sets.push(Prisma.sql`"validUntil" = ${v}`);
    }
    if (sets.length === 0) {
      return { ok: true as const };
    }
    sets.push(Prisma.sql`"updatedAt" = NOW()`);
    const frag = Prisma.join(sets, ", ");
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "MarketingCampaign" SET ${frag} WHERE id = ${id}`
    );
    return { ok: true as const };
  }

  async delete(id: string) {
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "MarketingCampaign" WHERE id = ${id}`
    );
    return { ok: true as const };
  }
}
